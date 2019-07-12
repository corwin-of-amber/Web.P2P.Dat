var signalhubws = require('signalhubws');
var hypercore = require('hypercore');
//var Discovery = require('hyperdiscovery')
var discovery = require('discovery-swarm-web');

var ram = require('random-access-memory');

const duplexify = require('duplexify'),
      through2 = require('through2'),
      {EventEmitter} = require('events');


/* This can work in node as well, but currently requires a tiny patch to discovery-swarm-web */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('wrtc') : undefined;


class Client extends EventEmitter {

    constructor() {
        super();
        this.storage = (fn) => { console.log(fn); return ram(); }
        this.deferred = {init: deferred(), ready: deferred()};

        this.muxPeers = new Map();
        this.remoteFeeds = [];
    }

    init() {
        return this._initPromise || (this._initPromise = this._init()
                                     .then(() => this.deferred.init.resolve()));
    }

    _init() {
        return new Promise((resolve, reject) => {
            this.hub = signalhubws('hyper-chat-example', ['wss://signalhubws.mauve.moe'], node_ws);

            this.swarm = discovery({signalhub: this.hub, wrtc,
                stream: (info) => {
                    console.log('stream', info); 
                    //var s = this.feed.replicate({live: true});
                    var m = new Muxer((id) => this.listen(id));
                    this.muxPeers.set(info.id, m);
                    //this.muxer.add(s);
                    Promise.resolve().then(() => m.stream.emit('handshake'));
                    return m.stream;
                    //return s;
                }
            });
            
            this.advertise = new Advertise(this.hub);
            /*
            this.hub.once('open', () => {
                this.advertise.start(() => this.advertisedKey);

                setTimeout(resolve, 1500);  // TODO wait for swarm?
            });*/
            this.hub.once('open', () => resolve());
        });
    }

    _mkfeed(key) {
        var feed = hypercore(this.storage, key, {valueEncoding: 'json'});

        feed.on('error', e => this.onError(feed, e));
        feed.on('append', () => this.onAppend(feed));
        feed.lastLength = 0;

        return feed;
    }

    async create(key) {
        await this.init();

        this.feed = this._mkfeed(key);

        this.feed.on('ready', () => this.onReady());
    }

    listen(key) {
        var feed = this._mkfeed(key);

        this.remoteFeeds.push(feed);

        return new Promise((resolve, reject) => {
            feed.on('ready', () => resolve(feed.replicate({live: true})));
            feed.on('error', (e) => reject(e));
        });
    }

    publish() {
        var id = this.feed.key;
        for (let mux of this.muxPeers.values()) {
            mux.add(id, this.feed.replicate({live: true}));
        }   
    }

    async join() {
        await this.init();

        this.create(await this.advertise.ask());
    }

    get key() {
        return this.longKey();
    }

    get advertisedKey() {
        return this.feed && this.feed.writable ? this.key : undefined;
    }

    longKey(feed) {
        feed = feed || this.feed;
        return feed && feed.key && feed.key.toString('hex');
    }

    shortKey(feed) {
        var key = this.longKey(feed);
        return key && key.substring(0, 6);
    }

    onReady() {
        console.log("feed.ready");

        //this.swarm.join(this.key, {wrtc});
        this.deferred.ready.resolve();

        // from this point on the hub connection is kept-alive by the swarm
        this.advertise.stopAsking();
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

    close() {
        if (this.hub) this.hub.close();
        if (this.swarm) this.swarm.close();   
    }
}


class Advertise {
    constructor(hub) {
        this.hub = hub;
        this.questionInterval = 3000;
    }
    start(answer) {
        this.hub.subscribe('?').on('data', () => {
            var res = answer();
            console.log('announce:answer', res);
            if (res)
                this.hub.broadcast('!', res);
        });

        this._keepAsking = setInterval(() => { 
            console.log('announce:ask'); this.hub.broadcast('?', '?'); 
        }, this.questionInterval);
    }
    ask() {
        return new Promise((resolve, reject) => {
            this.hub.subscribe('!').once('data', (msg) => { console.log(msg); resolve(msg); });
            this.hub.broadcast('?', '?');
        });
    }        
    stopAsking() {
        if (this._keepAsking)
            clearInterval(this._keepAsking);
    }
}

class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve; this.reject = reject;
        });
    }
    then(cb)  { return this.promise.then(cb); }
    catch(cb) { return this.promise.catch(cb); }
}

function deferred() { return new Deferred(); }



class Muxer {
    constructor(broker) {
        this.broker = broker;

        const self = this;

        function passw(chunk, enc, callback) {
            console.log(`Muxer.passw (${chunk.length})`, chunk.toString('hex'));
            var id = chunk.slice(0, 32);
            chunk = chunk.slice(32);
            self.getSubstream(id).then(s => s.write(chunk));
            callback(null);
        }
        function passr(chunk, enc, callback) {
            console.log(`Muxer.passr (${chunk.length})`, chunk.toString('hex'));
            callback(null, chunk);
        }

        //this.w = though2(passw);  this.w.pipe(stream);        
        //this.r = though2(passr);  this.r = stream.pipe(this.r);
      
        this.w = through2(passw);
        this.r = through2(passr);

        this.stream = duplexify(this.w, this.r);

        this.substreams = new Map();
    }

    add(id, stream) {
        var key = id.toString('hex');
        this.substreams.set(key, Promise.resolve(stream));
        this._pipe(id, stream);
    }

    _pipe(id, stream) {
        stream.pipe(this._prefixStream(id)).pipe(this.r);
    }

    getSubstream(id) {
        var key = id.toString('hex');
        if (!this.substreams.get(key)) {
            this.substreams.set(key, new Promise((resolve, reject) => {
                this.broker(id).then(s => {
                    this._pipe(id, s);
                    resolve(s);
                });
            }));
        }
        return this.substreams.get(key);
    }

    _prefixStream(id) {
        var pre = Buffer.from(id);
        if (pre.length !== 32)
            console.error('bad prefix', id);
        return through2((chunk, enc, callback) => {
            chunk = Buffer.concat([pre, chunk]);
            callback(null, chunk);
        });
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
    window.addEventListener('unload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2, setup});
}
else
    c1.join();
