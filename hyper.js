var signalhubws = require('signalhubws')
var hypercore = require('hypercore')
//var Discovery = require('hyperdiscovery')
var discovery = require('discovery-swarm-web');

var ram = require('random-access-memory')



/* This can work in node as well, but currently requires a tiny patch to discovery-swarm-web */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('wrtc') : undefined;


class Client {

    constructor() {
        this.storage = (fn) => { console.log(fn); return ram(); }
    }

    init() {
        return this._initPromise || (this._initPromise = this._init());
    }

    _init() {
        return new Promise((resolve, reject) => {
            this.hub = signalhubws('hyper-chat-example', ['wss://signalhubws.mauve.moe'], node_ws);

            this.swarm = discovery({signalhub: this.hub,
                stream: (info) => {
                    console.log('stream', info); 
                    return this.feed.replicate({live: true}); 
                }
            });

            this.advertise = new Advertise(this.hub);

            this.hub.once('open', () => {
                this.advertise.start(() => this.advertisedKey);

                setTimeout(resolve, 1500);  // TODO wait for swarm?
                if (!this.feed) {
                }
            });
        });
    }


    async create(key) {
        await this.init();

        this.feed = hypercore(this.storage, key, {valueEncoding: 'json'});

        this.feed.on('ready', () => this.onReady());
        this.feed.on('error', e => this.onError(e));
        this.feed.on('append', () => this.onAppend());

        this.lastLength = 0;
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

        this.swarm.join(this.key, {wrtc});

        // from this point on the hub connection is kept-alive by the swarm
        this.advertise.stopAsking();
    }

    async onAppend() {
        console.log("feed.append");

        var from = this.lastLength, to = this.feed.length;
        this.lastLength = this.feed.length;

        for (let i = from; i < to; i++) {
            let item = await new Promise((resolve, reject) =>
                this.feed.get(i, (err, data) => err ? reject(err) : resolve(data)));
            console.log(i, item);
        }
    }

    onError(e) {
        console.error('[feed error]', e);
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

var c = new Client();


function create(key) {
    var storage = (fn) => { console.log(fn); return ram(); }
    var feed = hypercore(storage, key);
    //var discovery = Discovery(feed)

    feed.on('ready', () => connect());
    feed.on('error', e => console.log('feed error:', e));
    feed.on('append', () => onAppend());

    function connect() {
//        return ;

        var hub = swarm.hub;        
        window.swarm = swarm;
    }

    Object.assign(window, {feed, ram});//, discovery});

    return feed;
}


function pipe(feed1, feed2) {
    var s1 = feed1.replicate({live: true}),
        s2 = feed2.replicate({live: true});
    s1.on('data', (d) => console.log('s1', d));
    s2.on('data', (d) => console.log('s2', d));
    s1.pipe(s2).pipe(s1);
}



if (typeof window !== 'undefined')
    Object.assign(window, {c, pipe});
else
    c.join();
