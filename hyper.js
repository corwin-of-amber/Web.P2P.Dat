var signalhubws = require('signalhubws');
var hypercore = require('hypercore'),
    protocol = require('hypercore-protocol');
//var Discovery = require('hyperdiscovery')
var discovery = require('discovery-swarm-web');

var ram = require('random-access-memory');

const {EventEmitter} = require('events');

const deferred = require('./src/core/deferred');


/* This can work in node as well, but currently requires a tiny patch to discovery-swarm-web */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('wrtc') : undefined;


var BOOTSTRAP_KEY = Buffer.from('deadbeefdeadbeefdeadbeefdeadbeef');


class SwarmClient extends EventEmitter {

    constructor(opts) {
        super();
        this.opts = opts;
        this.deferred = {init: deferred()};
    }

    init() {
        return this._initPromise || (this._initPromise = this._init()
                                     .then(() => this.deferred.init.resolve()));
    }

    _init() {
        return new Promise((resolve, reject) => {
            this.hub = signalhubws('hyper-chat-example', ['wss://signalhubws.mauve.moe'], node_ws);

            var id = this.swarm ? this.swarm.id : undefined;

            this.swarm = discovery({signalhub: this.hub, id, wrtc,
                stream: this.opts.stream
            });
            
            this.hub.once('open', () => {
                this._registerReconnect();
                resolve(); this.emit('init');
            });

            this.id = this.swarm.id.toString('hex');
            console.log("me: ", this.id);
        });
    }

    async join(channel) {
        await this.init();

        this.swarm.join(channel);
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

    reconnect() {
        this.close(); return this.init();
        // TODO: re-join swarm channels
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


class Client extends SwarmClient {

    constructor() {
        super({
            stream: info => this._stream(info),
            storage: ram
        });

        this.peers = new Map();
        this.localFeeds = [];
        this.remoteFeeds = [];

        this._listenPromises = new Map();
    }

    _stream(info) {
        console.log('stream', info);
        try {
            var peer = new Peer();
            this._populate(peer);
            this.peers.set(info.id, peer);
            return peer.protocol;
        }
        catch (e) { console.error(e); }
    }

    _control(peer, info) {
        console.log('control', this.shortKey(), peer.id, info);
        for (let key of info.have || []) {
            if (!this.localFeeds.some(x => this.longKey(x) === key))  // skip local
                this.listen(key).then(feed => peer.share(feed));
            // TODO: avoid multiple shares of same feed?
        }
    }

    async create(key) {
        var feed = this._mkfeed(key);

        if (!this.feed) {
            this.feed = feed;
        }
        this.localFeeds.push(feed);

        return this._waitForReady(feed);
    }

    listen(key) {
        var v = this._listenPromises.get(key);
        if (!v) {
            this._listenPromises.set(key, v = this._listen(key));
        }
        return v;
    }

    _listen(key) {
        var feed = this._mkfeed(key);

        this.remoteFeeds.push(feed);

        return this._waitForReady(feed);
    }

    publish() {
        for (let peer of this.peers.values()) {
            peer.publish(this.localFeeds);
        }
    }

    _mkfeed(key) {
        var feed = hypercore(this.opts.storage, key, {valueEncoding: 'json'});

        feed.on('ready', () =>
            console.log("feed", this.shortKey(feed)));

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

        var feeds = this.localFeeds.concat(this.remoteFeeds);
        for (let feed of feeds) peer.share(feed);

        var info = {have: feeds.map(x => this.longKey(x))};
        peer.control(info);
    }

    join(channel) {
        if (!this.feed) this.create();

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
        console.log("feed.append", this.shortKey(), this.shortKey(feed));

        var from = feed.lastLength, to = feed.length;
        feed.lastLength = feed.length;

        for (let i = from; i < to; i++) {
            try {
                let item = await new Promise((resolve, reject) =>
                    feed.get(i, (err, data) => err ? reject(err) : resolve(data)));
                console.log(i, item);
                this.emit('append', {me: this.key, from: this.longKey(feed), feed, 
                    index: i, data: item})
            }
            catch (e) {
                this.onError(feed, e);
            }
        }
    }

    onError(feed, e) {
        console.error('[feed error]', this.shortKey(feed), e);
    }
}


class Peer extends EventEmitter {
    constructor(opts) {
        super();
        this.protocol = protocol(opts);
        this.bootstrap = this.protocol.feed(BOOTSTRAP_KEY);
        this.bootstrap.on('data', (msg) => this._onData(msg));
        this._index = 0;
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
        feed.replicate({stream: this.protocol, live: true});
    }
    publish(feeds) {
        if (feeds.length > 0) {
            for (let feed of feeds) this.share(feed);
            var keys = feeds.map(x => x.key.toString('hex'));
            this.control({have: keys});
        }
    }
}




var c1 = new Client();
var c2 = new Client();

function setup() {
    c1.init(); c2.init();
    c1.swarm.join('lobby'); setTimeout(() => c2.swarm.join('lobby'), 500);
}



if (typeof window !== 'undefined') {
    if (typeof App === 'undefined') {
        console.log(require('./src/ui/ui'));
        Object.assign(window, require('./src/ui/ui'));
    }
    window.addEventListener('beforeunload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2, setup});
}
else
    c1.join('lobby');
