const _ = require('lodash');
const signalhubws = require('signalhubws');
const hypercore = require('hypercore'),
      protocol = require('hypercore-protocol');

const swarm = require('./discovery-swarm-web-thin');

const ram = require('random-access-memory');

const {EventEmitter} = require('events');

const deferred = require('../core/deferred'),
      options = require('../core/options');


/* This can work in node as well, but currently requires a tiny patch to discovery-swarm-web */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('wrtc') : undefined;


const DEFAULT_APP_NAME = 'hyper-chat-example',
      BOOTSTRAP_KEY = Buffer.from('global key for public feeds :):)'),
      DEFAULT_SERVERS = {hub: 'wss://amberhubws.herokuapp.com'},
      //DEFAULT_SERVERS = {hub: 'ws://localhost:3300'},
      DEFAULT_FEED_OPTS = {valueEncoding: 'json'},
      DEFAULT_FEED_META = {transitive: true};



class SwarmClient extends EventEmitter {

    constructor(opts) {
        super();
        this.opts = opts;
        this.opts.servers = this.opts.servers || DEFAULT_SERVERS;
        this.opts.appName = this.opts.appName || DEFAULT_APP_NAME;
        this.deferred = {init: deferred()};

        this.channels = new Set();
    }

    init() {
        return this._initPromise || (this._initPromise = this._init()
                                     .then(() => this.deferred.init.resolve()));
    }

    _init() {
        return new Promise((resolve, reject) => {
            this.hub =
                signalhubws(DEFAULT_APP_NAME, [this.opts.servers.hub], node_ws);

            var id = this.swarm ? this.swarm.id : undefined;

            this.swarm = swarm({signalhub: this.hub, id, wrtc,
                stream: this.opts.stream
            });
            
            this.hub.once('open', () => {
                this._registerReconnect();
                resolve(); this.emit('init');
            });

            this.swarm.webrtc.on('connection', (peer, info) =>
                this.emit('peer-connect', peer, info));
            this.swarm.webrtc.on('connection-closed', (peer, info) =>
                this.emit('peer-disconnect', peer, info));

            this.id = this.swarm.id.toString('hex');
            console.log(`me: %c${this.id}`, 'color: green;');
        });
    }

    async join(channel) {
        this.channels.add(channel);

        await this.init();
        this.swarm.join(channel, {wrtc});
    }

    close() {
        this._unregisterReconnect();
        if (this.hub) this.hub.close();
        if (this.swarm) {
            if (this.swarm.webrtc) this.swarm.webrtc.close(); // bug in discovery-swarm-web
            this.swarm.close();
        }
        this._initPromise = null;
    }

    async reconnect() {
        console.log("%c- reconnect -", 'color: red;')
        this.close();
        
        await this.init();
        for (let chan of this.channels) this.join(chan)
    }

    /**
     * Finds the SimplePeer instance associated with a peer.
     * @param {string|Uint8Array|Wire} id peer id, or a Wire instance
     * @param {string} channel channel name; if omitted, looks in all channels
     */
    getPeer(id, channel=undefined) {
        if (id.id) id = id.id;
        if (typeof id !== 'string') id = id.toString('hex');

        var channelMap = this.swarm.webrtc.channels,
            channels = channel ? [channelMap.get(channel)].filter(x => x)
                               : channelMap.values()

        for (let chan of channels) {
            var p = chan.swarm.remotes[id];
            if (p) return p;
        }
    }

    _registerReconnect() {
        for (let s of this.hub.sockets) s.onclose = () => this.reconnect();
    }

    _unregisterReconnect() {
        if (this.hub) {
            for (let s of this.hub.sockets) s.onclose = null
        }
    }
}


/**
 * Herds a collection of feeds and shares them across a swarm.
 */
class FeedClient extends SwarmClient {

    constructor() {
        super({
            stream: info => this._stream(info),
            storage: ram
        });

        this.peers = new Map();
        this.localFeeds = [];
        this.remoteFeeds = [];

        this._listenPromises = new Map();

        this.on('peer-disconnect', (peer, info) => this._removePeer(info.id));
    }

    _stream(info) {
        console.log('stream', info);
        try {
            var peer = new Wire({id: info.id});
            this._populate(peer);
            this.peers.set(info.id, peer);
            return peer.protocol;
        }
        catch (e) { console.error(e); }
    }

    _control(peer, info) {
        console.log('control', this.shortKey(), peer.id, info);
        for (let entry of info.have || []) {
            let {key, opts, meta} = entry;
            if (!this.localFeeds.some(x => this.longKey(x) === key))  // skip local
                this.listen(key, opts, meta).then(feed => peer.share(feed));
        }
    }

    async create(opts, meta, asMaster) {
        var feed = this._mkfeed(null, opts, meta);

        if (asMaster || (!this.feed && !(asMaster === false))) {
            this.feed = feed;
        }
        this.localFeeds.push(feed);

        await this._waitForReady(feed);
        this.publish([feed]);  // local feeds are published regardless of transitivity
        return feed;
    }

    listen(key, opts, meta) {
        var v = this._listenPromises.get(key);
        if (!v) {
            this._listenPromises.set(key, v = this._listen(key, opts, meta));
        }
        return v;
    }

    _listen(key, opts, meta) {
        var feed = this._mkfeed(key, opts, meta);

        this.remoteFeeds.push(feed);

        return this._waitForReady(feed);
    }

    publish(feeds=this.localFeeds) {
        for (let peer of this.peers.values()) {
            peer.publish(feeds);
        }
    }

    _mkfeed(key, opts, meta) {
        var feed = hypercore(this.opts.storage, key, options(opts, DEFAULT_FEED_OPTS));
        feed.meta = options(meta, DEFAULT_FEED_META);

        feed.on('ready', () =>
            console.log(`feed %c${this.shortKey(feed)}`, 'color: blue;'));

        feed.on('error', e => this.onError(feed, e));
        feed.on('append', () => this.onAppend(feed));
        feed.lastLength = 0;

        return feed;
    }

    _waitForReady(feed) {
        return new Promise((resolve, reject) => {
            feed.on('ready', () => {
                feed.removeListener('error', reject); resolve(feed); });
            feed.on('error', reject);
        });
    }

    _populate(peer) {
        peer.on('control', info => this._control(peer, info))

        let isTransitive = f => f.meta && f.meta.transitive;

        var feeds = this.localFeeds.concat(this.remoteFeeds.filter(isTransitive));
        peer.publish(feeds);
    }

    _removePeer(id) {
        this.peers.delete(id);
    }

    join(channel, withFeed=true) {
        if (withFeed && !this.feed) this.create();

        return super.join(channel);
    }

    get key() {
        return this.longKey();
    }

    longKey(feed) {
        feed = feed || this.feed;
        return feed && feed.key && feed.key.toString('hex');
    }

    shortKey(feed) {
        var key = this.longKey(feed);
        return key && key.substring(0, 6);
    }

    async onAppend(feed) {
        //console.log("feed.append", this.shortKey(), this.shortKey(feed), feed.length);

        var from = feed.lastLength, to = feed.length;
        feed.lastLength = feed.length;

        for (let i = from; i < to; i++) {
            this._feedGet(feed, i).then(item => {
                //console.log(this.shortKey(feed), i, item);
                this.emit('append', {me: this.key, from: this.longKey(feed), feed, 
                    index: i, data: item})
            })
            .catch(e => this.onError(feed, e));
        }
    }

    onError(feed, e) {
        console.error('[feed error]', this.shortKey(feed), e);
    }

    _feedGet(feed, i) {
        return new Promise((resolve, reject) =>
            feed.get(i, (err, data) => err ? reject(err) : resolve(data)));
    }

    _feedGetAll(feed) {
        return Promise.all(_.range(feed.length).map(i =>
            this._feedGet(feed, i)
        ));
    }

    async _dump(feeds) {
        feeds = feeds || (this.localFeeds.concat(this.remoteFeeds));

        var dump = {};

        for (let feed of feeds) {
            dump[this.shortKey(feed)] = await this._feedGetAll(feed);
        }

        return dump;
    }
}


/**
 * Minimal peer object, contains a bootstrap feed to communicate
 * available feeds through the connection.
 */
class Wire extends EventEmitter {
    constructor(opts) {
        super();
        this.protocol = protocol(opts);
        this.bootstrap = this.protocol.feed(BOOTSTRAP_KEY);
        this.bootstrap.on('data', (msg) => this._onData(msg));
        this._index = 0;
        this._shared = new WeakSet();  // feeds that have been shared
    }
    get id() {
        return this.protocol.id;
    }
    control(info) {
        var index = this._index++;
        this.bootstrap.data({index, value: JSON.stringify(info)});
    }
    _onData(msg) {
        this.emit('control', JSON.parse(msg.value));
    }
    share(feed) {
        if (!this._shared.has(feed)) {
            this._shared.add(feed);
            feed.replicate({stream: this.protocol, live: true});
        }
    }
    publish(feeds) {
        if (feeds.length > 0) {
            for (let feed of feeds) this.share(feed);
            var entries = feeds.map(x => ({
                key: x.key.toString('hex'), meta: x.meta
            }));
            this.control({have: entries});
        }
    }
}


module.exports = {SwarmClient, FeedClient};
