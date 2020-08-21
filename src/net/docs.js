import assert from 'assert';
import { EventEmitter } from 'events';

import { FeedClient } from './client';
import { DocSync } from './docsync';



class DocumentClient extends FeedClient {

    constructor(opts) {
        super(opts);

        this._setupDoc();
        this._tuneInForShouts();
    }

    async _setupDoc() {
        this.docFeeds = {};
        this.docGroup = new FeedGroup(this, 
            feed => feed.meta && feed.meta.type === 'docsync');

        var outqueue = null, inqueue = [], engage = true;

        this.sync = new DocSync();
        this.sync.on('data', d => {
            if (!d.changes && !engage) { outqueue = d; return; }
            var feed = d.changes ? this.docFeeds.changes : this.docFeeds.transient;
            if (feed) feed.append(d);
            else console.warn('DocSync message lost;', d);
        });
        this.docGroup.on('feed:append', ev => {
            if (!this.docGroup.isSynchronized()) engage = false;
            if (ev.info.loc === FeedGroup.Loc.REMOTE) {
                engage ? this.sync.data(ev.data)
                       : inqueue.push(ev.data);
            }
        });
        this.docGroup.on('sync', () => {
            var d;
            while (d = inqueue.shift()) this.sync.data(d);
            this.emit('doc:sync');
            engage = true;
            if (outqueue) { this.sync.emit('data', outqueue); outqueue = null; }
        });

        this.isSynchronized = () => engage && this.docGroup.isSynchronized();
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
        this.docGroup.on('feed:extension', (name, msg, peer) => {
            console.log(`${name} %c${peer.stream.stream.id.slice(0,7)}`, 'color: green;');
            if (name === 'shout') this.emit('shout');
        });
    }

}


/**
 * Represents a subset of the feeds shared by a client and provides
 * aggregate data reception and synchronization events.
 */
class FeedGroup extends EventEmitter {

    constructor(client, selector=()=>true) {
        super();
        this.client = client;
        this.selector = selector;  // controls which feeds are members of this group
        this.members = new Map();

        this._initEvents();
        this._initMembers();
    }

    isSynchronized() {
        return ievery(this.members.entries(), 
                ([feed, {loc, stats}]) => loc === FeedGroup.Loc.LOCAL ||
                                          stats.index >= feed.length - 1);
    }

    _initEvents() {
        this.client.crowd.on('feed:ready', feed => {
            if (this.selector(feed)) this._add(feed);
        });
        this.client.on('feed:append', ev => {
            if (this.selector(ev.feed)) {
                var entry = ev.info = this.members.get(ev.feed);
                this.emit('feed:append', ev);
                this._updateStats(entry, ev);
            }
        });
    }

    _initMembers() {
        for (let feed of this.client.crowd.feeds)
            if (this.selector(feed)) this._add(feed);
    }

    _add(feed) {
        this.members.set(feed, {loc: this._locationOf(feed),
                                stats: {index: -1}});
        feed.on('extension', (name, msg, peer) =>
            this.emit('feed:extension', name, msg, peer));
    }

    _locationOf(feed) {
        return this.client.crowd.localFeeds.includes(feed) 
                    ? FeedGroup.Loc.LOCAL : FeedGroup.Loc.REMOTE;
    }

    _updateStats(entry, event) {
        assert(entry);
        if (entry.loc === FeedGroup.Loc.REMOTE) {
            entry.stats.index = Math.max(entry.stats.index, event.index);
            if (event.index >= event.feed.length - 1 && this.isSynchronized())
                this.emit('sync');
        }
    }

}

FeedGroup.Loc = Object.freeze({LOCAL: 0, REMOTE: 1});


function ievery(iterable, predicate) {
    for (let el of iterable) if (!predicate(el)) return false;
    return true;
}



export { FeedGroup, DocumentClient }
