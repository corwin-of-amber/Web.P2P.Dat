var signalhubws = require('signalhubws');
var hypercore = require('hypercore');
//var Discovery = require('hyperdiscovery')
var discovery = require('discovery-swarm-web');

var ram = require('random-access-memory');

const duplexify = require('duplexify'),
      through2 = require('through2');


/* This can work in node as well, but currently requires a tiny patch to discovery-swarm-web */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('wrtc') : undefined;


class Client {

    constructor() {
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

            this.swarm = discovery({signalhub: this.hub,
                stream: (info) => {
                    console.log('stream', info); 
                    //var s = this.feed.replicate({live: true});
                    var m = new Muxer((idx) => this.listen(keys[idx]));
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

        feed.on('error', e => this.onError(e));
        feed.on('append', () => this.onAppend(feed));

        return feed;
    }

    async create(key) {
        await this.init();

        this.feed = this._mkfeed(key);

        this.feed.on('ready', () => this.onReady());

        this.lastLength = 0;
    }

    listen(key) {
        var feed = this._mkfeed(key);

        this.remoteFeeds.push(feed);

        return new Promise((resolve, reject) => {
            feed.on('ready', () => resolve(feed.replicate({live: true})));
            feed.on('error', (e) => reject(e));
        });
    }

    publish(idx=0) {
        for (let mux of this.muxPeers.values()) {
            mux.add(idx, this.feed.replicate({live: true}));
        }   
    }

    async join() {
        await this.init();

        this.create(await this.advertise.ask());
    }

    get key() {
        return this.feed && this.feed.key && this.feed.key.toString('hex');
    }

    get advertisedKey() {
        return this.feed && this.feed.writable ? this.key : undefined;
    }

    onReady() {
        console.log("feed.ready");

        //this.swarm.join(this.key, {wrtc});
        this.deferred.ready.resolve();

        // from this point on the hub connection is kept-alive by the swarm
        this.advertise.stopAsking();
    }

    async onAppend(feed) {
        console.log("feed.append");

        if (feed == this.feed) {
            var from = this.lastLength, to = feed.length;
            this.lastLength = feed.length;

            for (let i = from; i < to; i++) {
                let item = await new Promise((resolve, reject) =>
                    feed.get(i, (err, data) => err ? reject(err) : resolve(data)));
                console.log(i, item);
            }
        }
    }

    onError(e) {
        console.error('[feed error]', e);
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


var keys = [];


class Muxer {
    constructor(broker) {
        this.broker = broker;

        const self = this;

        function passw(chunk, enc, callback) {
            console.log("Muxer.passw", chunk);
            var idx = chunk[0];
            chunk = chunk.slice(1);
            self.getSubstream(idx).then(s => s.write(chunk));
            callback(null);
        }
        function passr(chunk, enc, callback) {
            console.log("Muxer.passr", chunk);
            callback(null, chunk);
        }

        //this.w = though2(passw);  this.w.pipe(stream);        
        //this.r = though2(passr);  this.r = stream.pipe(this.r);
      
        this.w = through2(passw);
        this.r = through2(passr);

        this.stream = duplexify(this.w, this.r);

        this.substreams = [];
    }

    add(idx, stream) {
        this.substreams[idx] = Promise.resolve(stream);
        this._pipe(idx, stream);
    }

    _pipe(idx, stream) {
        stream.pipe(this._preindexStream(idx)).pipe(this.r);
    }

    getSubstream(idx) {
        if (!this.substreams[idx]) {
            this.substreams[idx] = new Promise((resolve, reject) => {
                this.broker(idx).then(s => {
                    this._pipe(idx, s);
                    resolve(s);
                });
            });
        }
        return this.substreams[idx];
    }

    _preindexStream(idx) {
        var pre = Buffer.from([idx]);
        return through2((chunk, enc, callback) => {
            chunk = Buffer.concat([pre, chunk]);
            callback(null, chunk);
        });
    }
}


var c1 = new Client();
var c2 = new Client();


if (typeof window !== 'undefined') {
    window.addEventListener('unload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2, keys});
}
else
    c1.join();
