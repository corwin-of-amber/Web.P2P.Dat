const _ = require('lodash');
const signalhubws = require('signalhubws');

const swarm = require('./discovery-swarm-web-thin');

const ram = require('random-access-memory');

const {EventEmitter} = require('events'),
      mergeOptions = require('merge-options');

const deferred = require('../core/deferred'),
      {FeedCrowd} = require('./crowd'),
      {DocSync} = require('./merge');



/* This can work in node as well, but switching to discovery-swarm-web would require a tiny patch */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('wrtc') : undefined;


const DEFAULT_OPTIONS = {
        appName: 'dat-p2p-crowd',
        servers: {hub: 'wss://amberhubws.herokuapp.com'}
        //servers: {hub: 'ws://localhost:3300'}
    };



class SwarmClient extends EventEmitter {

    constructor(opts) {
        super();
        this.opts = mergeOptions(DEFAULT_OPTIONS, opts);
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
                signalhubws(this.opts.appName, [this.opts.servers.hub], node_ws);

            var id = this.swarm ? this.swarm.id : undefined;

            this.swarm = swarm({signalhub: this.hub, id, wrtc,
                stream: this.opts.stream
            });
            
            this.hub.once('open', () => {
                this._registerCloseEvents();
                resolve(); this.emit('init');
            });

            this.swarm.webrtc.on('connection', (peer, info) =>
                this.emit('peer-connect', peer, info));
            this.swarm.webrtc.on('connection-closed', (peer, info) =>
                this.emit('peer-disconnect', peer, info));

            this.id = this.swarm.id.toString('hex');
            console.log(`me: %c${this.id}`, 'color: green;');

            this._registerReconnect();
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
        if (!this.swarm) return undefined;

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

    getPeers(channel=undefined) {
        if (!this.swarm) return [];

        var peers = [];

        var channelMap = this.swarm.webrtc.channels,
            channels = channel ? [channelMap.get(channel)].filter(x => x)
                               : channelMap.values()

        for (let chan of channels) {
            peers.push(...Object.values(chan.swarm.remotes));
        }

        return peers;
    }

    _registerCloseEvents() {
        for (let s of this.hub.sockets) s.onclose = () => this.emit('disconnect');
    }

    _registerReconnect() {
        if (!this._reconnectHandler) {
            this._reconnectHandler = () => this.reconnect();
            this.on('disconnect', this._reconnectHandler);
        }
    }

    _unregisterReconnect() {
        if (this._reconnectHandler) {
            this.removeListener('disconnect', this._reconnectHandler);
            this._reconnectHandler = null;
        }
    }
}



class FeedClient extends SwarmClient {

    constructor(opts) {
        super(mergeOptions({
            stream: info => this._stream(info)
        }, opts));

        this.peers = new Map();

        this.crowd = new FeedCrowd({storage: ram, feed: {valueEncoding: 'json'}, 
                                    extensions: ['shout']});

        this.crowd.on('feed:append', feed => this.onAppend(feed));
        this.crowd.on('feed:error', (feed, e) => this.onError(feed, e));
        this.crowd.on('error',  e => this.onError(null, e));

        this.on('peer-disconnect', (peer, info) => this._removePeer(info.id));
    }

    _stream(info) {
        console.log('stream', info);
        try {
            var wire = this.crowd.replicate({id: info.id});
            this.peers.set(info.id, wire);
            return wire.chunked();
        }
        catch (e) { console.error(e); }
    }

    async create(opts, meta, asMaster) {
        var feed = await this.crowd.create(opts, meta);
        
        if (asMaster || (!this.feed && !(asMaster === false))) {
            this.feed = feed;
        }

        return feed;
    }

    _removePeer(id) {
        this.peers.delete(id);
    }

    get key() {
        return this.crowd.longKey(this.feed);
    }

    async onAppend(feed) {
        //console.log("feed.append", this.crowd.shortKey(), this.crowd.shortKey(feed), feed.length);

        if (feed.opts && feed.opts.sparse && !feed.opts.eagerUpdate) return;

        var from = feed.lastLength, to = feed.length;
        feed.lastLength = feed.length;

        for (let i = from; i < to; i++) {
            await this._feedGet(feed, i).then(item => {
                //console.log(this.crowd.shortKey(feed), i, item);
                this.emit('append', {me: this.key, from: this.crowd.longKey(feed), feed, 
                    index: i, data: item})
            })
            .catch(e => this.onError(feed, e));
        }
    }

    onError(feed, e) {
        console.error('[feed error]', this.crowd.shortKey(feed), e);
    }

    _feedGet(feed, i) {
        return new Promise((resolve, reject) =>
            feed.get(i, (err, data) => err ? reject(err) : resolve(data)));
    }
}


class DocumentClient extends FeedClient {

    constructor(opts) {
        super(opts);

        this._setupDoc();
        this._tuneInForShouts();
    }

    async _setupDoc() {
        this.docFeeds = {};

        this.sync = new DocSync();
        this.sync.on('data', d => {
            var feed = d.changes ? this.docFeeds.changes : this.docFeeds.transient;
            if (feed) feed.append(d);
            else console.warn('DocSync message lost;', d);
        });
        this.on('append', ev => {
            if (ev.feed.meta && ev.feed.meta.type === 'docsync' &&
                !Object.values(this.docFeeds).includes(ev.feed)) {
                this.sync.data(ev.data);
            }
        });
    }

    async _init() {
        await super._init();
        await this._initFeeds();
    }

    async _initFeeds() {
        var d = this.docFeeds, type = 'docsync';
        d.changes = d.changes || await this.create({}, {type}, false);
        d.transient = d.transient ||
                await this.create({extensions: ['shout']}, {type, transitive: false}, false);
    }

    shout() {
        this.docFeeds.transient.extension('shout', Buffer.from(''));
    }

    _tuneInForShouts() {
        this.crowd.on('feed:ready', feed => {
            if (feed.meta.type === 'docsync') {
                feed.on('extension', (name, msg, peer) => {
                    console.log(`${name} %c${peer.stream.stream.id.slice(0,7)}`, 'color: green;');
                    if (name === 'shout') this.emit('shout');
                });
            }
        })
    }

}



module.exports = {SwarmClient, FeedClient, DocumentClient};
