const hypercore = require('hypercore'),
      Protocol = require('hypercore-protocol');

const {EventEmitter} = require('events');

const options = require('../core/options');



const BOOTSTRAP_KEY = Buffer.from('global key for public feeds :):)'),
      DEFAULT_FEED_OPTS = {valueEncoding: 'json'},
      DEFAULT_FEED_META = {transitive: true};


/**
 * Herds a collection of feeds and provides a single replication stream to
 * share all of them.
 */
class FeedCrowd extends EventEmitter {

    constructor(opts) {
        super();
        this.opts = opts;

        this.localFeeds = [];
        this.remoteFeeds = [];

        this._listenPromises = new Map();
        this._replicated = new Set();
    }

    replicate(opts) {
        var wire = new Wire(opts)
            .on('control', info => this._control(wire, info))
            .on('close', () => this._replicated.delete(wire));
        this._replicated.add(wire);
        this._populate(wire);
        return wire;
    }

    create(opts, meta) {
        var feed = this._mkfeed(null, opts, meta);

        this.localFeeds.push(feed);

        return this._waitForReady(feed);
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

    longKey(feed) {
        return feed && feed.key && feed.key.toString('hex');
    }

    shortKey(feed) {
        var key = this.longKey(feed);
        return key && key.substring(0, 7);
    }

    _mkfeed(key, opts, meta) {
        var feed = hypercore(opts && opts.storage || this.opts.storage, 
                             key,
                             options(opts, DEFAULT_FEED_OPTS));
        feed.meta = options(meta, DEFAULT_FEED_META);

        feed.on('ready', () =>
            console.log(`feed %c${this.shortKey(feed)}`, 'color: blue;'));

        feed.on('error', e => this.emit('feed:error', feed, e));
        feed.on('append', () => { this._onAppend(feed); this.emit('feed:append', feed); });
        
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

    _control(wire, info) {
        console.log('control', wire.id, info);
        for (let entry of info.have || []) {
            let {key, opts, meta} = entry;
            if (!this.localFeeds.some(x => this.longKey(x) === key))  // skip local
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
        if (feed.lastLength === 0 && feed.writable) this.publish([feed]);
    }
}



/**
 * Minimal peer object, contains a bootstrap feed to communicate
 * available feeds through the connection.
 */
class Wire extends Protocol {
    constructor(opts) {
        super(opts);
        this.bootstrap = this.feed(BOOTSTRAP_KEY);
        this.bootstrap.on('data', (msg) => this._onData(msg));
        this._index = 0;
        this._shared = new WeakSet();  // feeds that have been shared
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
            feed.replicate({stream: this, live: true});
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



module.exports = {FeedCrowd}
