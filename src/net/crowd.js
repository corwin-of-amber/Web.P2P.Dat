const hypercore = require('hypercore'),
      Protocol = require('hypercore-protocol');

const {EventEmitter} = require('events');

const options = require('../core/options'),
      munch = require('../core/munch');



const DEFAULT_OPTS = {
        key: Buffer.from('global key for public feeds :):)'),
        feed: {},
        meta: {transitive: true}
    };


/**
 * Herds a collection of feeds and provides a single replication stream to
 * share all of them.
 */
class FeedCrowd extends EventEmitter {

    constructor(opts) {
        super();
        this.opts = options(opts, DEFAULT_OPTS);

        this.localFeeds = [];
        this.remoteFeeds = [];

        this._listenPromises = new Map();
        this._replicated = new Set();
    }

    get feeds() { return this.localFeeds.concat(this.remoteFeeds); }

    replicate(opts) {
        var wire = new Wire(this.opts.key, opts)
            .on('handshake', () => this._populate(wire))
            .on('control', info => this._control(wire, info))
            .on('error', e => this.emit('error', e, wire))
            .on('close', () => this._replicated.delete(wire));
        this._replicated.add(wire);
        return wire;
    }

    create(opts, meta) {
        var feed = this._mkfeed(null, opts, meta);

        this.localFeeds.push(feed);

        return this._waitForReady(feed);
    }

    get(key) {
        return this.getOrElse(key, () => {
            throw new Error(`feed not found (key='${key.toString('hex')}')`);
        });
    }

    getOrElse(key, default_or_function) {
        var keyh = key.toString('hex'),
            feed = this.feeds.find(feed => keyHex(feed) === keyh)
        return feed ? this._waitForReady(feed) :
                (typeof default_or_function === 'function')
                 ? default_or_function(key) : default_or_function;
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

    longKey(feed) { return keyHex(feed); }
    shortKey(feed) { return keyHexShort(feed); }

    _mkfeed(key, opts, meta) {
        opts = options(opts, this.opts.feed);

        var feed = hypercore(opts.storage || this.opts.storage, 
                             key, opts);
        feed.opts = opts;
        feed.meta = options(meta, this.opts.meta);

        feed.on('ready', () => {
            console.log(`feed %c${keyHexShort(feed)}`, 'color: blue;');
            this.emit('feed:ready', feed);
        });

        feed.on('error', e => this.emit('feed:error', feed, e));
        feed.on('append', () => { this._onAppend(feed); this.emit('feed:append', feed); });
        
        feed.lastLength = 0;
        feed._new = true;

        return feed;
    }

    _waitForReady(feed) {
        if (feed.key) return Promise.resolve(feed);

        return new Promise((resolve, reject) => {
            feed.on('ready', () => {
                feed.removeListener('error', reject); resolve(feed); });
            feed.on('error', reject);
        });
    }

    _control(wire, info) {
        console.log('control', wire.id, info);
        for (let entry of info.have || []) {
            let {key, opts, meta} = entry;
            if (!this.localFeeds.some(x => keyHex(x) === key))  // skip local
                this.listen(key, opts, meta).then(feed => wire.share(feed));
        }
    }

    publish(feeds=this.localFeeds) {
        for (let wire of this._replicated) {
            wire.publish(feeds);
        }
    }

    _populate(wire) {
        let isNonEmpty = f => f.length > 0,
            isTransitive = f => f.meta && f.meta.transitive;

        var feeds = this.localFeeds.filter(isNonEmpty)
            .concat(this.remoteFeeds.filter(isTransitive));
        wire.publish(feeds);
    }

    _onAppend(feed) {
        // publish owned feeds on first write
        if (feed._new && feed.writable) 
            { this.publish([feed]); feed._new = false; }
    }

}



/**
 * Minimal peer protocol object, contains a metastream feed to communicate
 * available feeds through the connection.
 */
class Wire extends Protocol {

    /**
     * Constructs a feed-sharing connection protocol.
     * @param {Buffer} key encryption key
     * @param {object} opts options passed to Protocol
     */
    constructor(key, opts) {
        super(opts);
        this.metastream = this.feed(key);
        this.metastream.on('data', (msg) => this._onData(msg));
        this._index = 0;
        this._shared = new WeakSet();  // feeds that have been shared
    }

    control(info) {
        var index = this._index++;
        this.metastream.data({index, value: JSON.stringify(info)});
    }

    _onData(msg) {
        this.emit('control', JSON.parse(msg.value));
    }

    share(feed) {
        if (!this._shared.has(feed)) {
            this._shared.add(feed);
            feed.replicate({stream: this, live: true});
        }
    }

    publish(feeds) {
        if (feeds.length > 0) {
            for (let feed of feeds) this.share(feed);
            var entries = feeds.map(x => ({
                key: keyHex(x), opts: x.opts, meta: x.meta
            }));
            this.control({have: entries});
        }
    }

    /**
     * Creates a "chunked" version of the replication stream, for sharing
     * over connections with limits on message sizes (e.g. RTCDataChannel).
     * @param {int} blockSize maximum message size
     */
    chunked(blockSize=65536) {
        var chunked = munch.ofDuplex(this, blockSize);
        this.on('handshake', () => chunked.emit('handshake'));
        return chunked;
    }

}


function keyHex(feed) {
    return feed && feed.key && feed.key.toString('hex');
}

function keyHexShort(feed) {
    var key = keyHex(feed);
    return key && key.substring(0, 7);
}



module.exports = {FeedCrowd, keyHex, keyHexShort}
