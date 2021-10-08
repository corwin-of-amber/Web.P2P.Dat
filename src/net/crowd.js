import fs from 'fs';      /* @kremlin.native */
import path from 'path';  /* @kremlin.native */
import { EventEmitter } from 'events';
import mergeOptions from 'merge-options';

import hypercore from 'hypercore'
import Protocol from 'hypercore-protocol';

import raf from 'random-access-file/index';

import munch from '../core/munch';



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
        this.opts = mergeOptions(DEFAULT_OPTS, opts);

        this.localFeeds = [];
        this.remoteFeeds = [];

        this._listenPromises = new Map();
        this._replicated = new Set();
    }

    get feeds() { return this.localFeeds.concat(this.remoteFeeds); }

    replicate(initiator, opts) {
        opts = mergeOptions({extensions: this.opts.extensions}, opts);
        var wire = new Wire(initiator, this.opts.key, opts)
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

    load(storageDir /* : FeedCrowdStorageDirectory */) {
        var feeds = storageDir.loadAll().map(({opts, meta}) =>
            this._mkfeed(null, opts, meta));
        
        this.remoteFeeds.push(...feeds);

        return Promise.all(feeds.map(async f => {
            await this._waitForReady(f);
            this._listenPromises.set(keyHex(f), Promise.resolve(f));
            return f;
        }));
    }

    longKey(feed) { return keyHex(feed); }
    shortKey(feed) { return keyHexShort(feed); }

    _mkfeed(key, opts, meta) {
        opts = mergeOptions(this.opts.feed, opts);

        var feed = hypercore(opts.storage || this.opts.storage || this.opts.storageFactory?.(key, meta),
                             key, opts);
        feed.opts = opts;
        feed.meta = mergeOptions(this.opts.meta, meta);

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
        for (let entry of info.have || []) {
            let {key, opts, meta} = entry;
            if (!this.localFeeds.some(x => keyHex(x) === key))  // skip local
                this.listen(key, opts, meta).then(feed => wire.share(feed));
            // @todo publish to other wires. but do avoid cycles among peers
            // (fix `Wire.share`)
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
     * @param {boolean} initiator whether this side of the connection is initiating
     *   (used by handshake protocol)
     * @param {Buffer} key encryption key
     * @param {object} opts options passed to Protocol
     */
    constructor(initiator, key, opts) {
        super(initiator, opts);
        this.metastream = this.open(key, {ondata: msg => this._onData(msg)});
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
            this._validateExtensions(feed);
            this._shared.add(feed);
            feed.replicate(this, {live: true});
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

    _validateExtensions(feed) {
        for (let e of feed.extensions) {
            if (!this.extensions.includes(e))
                console.warn(`hypercore extension '${e}' is not registered with this crowd`);
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


class FeedCrowdStorageDirectory {
    constructor(root) {
        this.root = root;
        this._fresh = 0;
        this.subdirs = new Map();  // subdirs keyed by feed id
        this.meta = {};  // serializable metadata keyed by subdir
        this.loadMeta();
        this.updateIndex();
    }

    get storageFactory() {
        return (key, meta) => this.for(key, meta);
    }

    for(key, meta) {
        var subdir = key && this.subdirs[this._key(key)];
        return this.get(subdir ?? (this._fresh++).toString(), meta);
    }

    load(subdir) {
        return {opts: {storage: this.get(subdir)}, meta: this.meta[subdir]};
    }

    loadAll() {
        return [...this.subdirs.values()].map(subdir => this.load(subdir));
    }

    loadMeta() {
        try {
            this.meta = JSON.parse(fs.readFileSync(this._metafn));
        }
        catch { this.meta = {}; }
    }

    saveMeta() {
        fs.mkdirSync(this.root, {recursive: true});
        fs.writeFileSync(this._metafn, JSON.stringify(this.meta));
    }

    updateIndex() {
        try {
            var existing = fs.readdirSync(this.root);
        }
        catch { return; }
        
        for (let subdir of existing) {
            if (+subdir >= this._fresh) this._fresh = +subdir + 1;
            try {
                var key = fs.readFileSync(path.join(this.root, subdir, 'key'));
            }
            catch { continue; }
            this.subdirs.set(this._key(key), subdir);
        }    
    }

    get(subdir, meta) {
        const directory = path.join(this.root, subdir);
        if (meta) { this.meta[subdir] = meta; this.saveMeta(); }
        /** @todo use hypercore-default-storage, just force native raf */
        return (name) => raf(name, {directory});
    }

    get _metafn() {
        return path.join(this.root, 'index.json');
    }

    _key(key) { return key.toString('hex'); }
}


function keyHex(feed) {
    return feed && feed.key && feed.key.toString('hex');
}

function keyHexShort(feed) {
    var key = keyHex(feed);
    return key && key.substring(0, 7);
}



module.exports = {FeedCrowd, FeedCrowdStorageDirectory, keyHex, keyHexShort}
