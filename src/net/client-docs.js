import assert from 'assert';

import { FeedClient } from './client';
import { DocSync } from './docsync';
import { FeedGroup, keyHexShort } from './crowd';



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

        this.sync = new DocSync();

        this.sync.on('data', d => {
            this.docFeeds.transient?.extension('crdt', Buffer.from(d));
        });

        this.crowd.on('feed:extension', (feed, {name, msg, peer}) => {
            if (name === 'crdt')
                this.sync.data(msg.slice(0, msg.length - 9));
        });

        this.docGroup.on('feed:append', ev => {
            this.sync.protocol.poke();
        });

        /*
        var outqueue = {}, inqueue = [], engage = true,
            outpush = (k, d) => outqueue[k] = this._combine(outqueue[k], d); /** @hmm ok? *

        this.sync.on('data', d => {
            if (!d.changes && !engage) { outpush(d.docId, d); return; }
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
            for (let d of Object.values(outqueue))
                this.sync.emit('data', d);
            outqueue = {};
        });*/

        this.isSynchronized = () => engage && this.docGroup.isSynchronized();
    }

    async _init() {
        await super._init();
        await this._initFeeds();
    }

    async _initFeeds() {
        var d = this.docFeeds, type = 'docsync';
        //d.changes = d.changes || await this.create({}, {type}, false);
        if (!d.transient) {
            d.transient = await this.create({extensions: ['shout', 'crdt']},
                {type, transitive: false}, false);
        }
        d.transient.append('^'); /* poke peers */
    }

    /*
     ** Merges clock values from two messages *
    _combine(d1, d2) {
        if (!d1 || !d2) return d1 ?? d2;
        /** assert(d1.docId == d2.docId); /**
        d1.clock = this._countersMax(d1.clock, d2.clock);
        return d1;
    }

    _countersMax(cobj1 = {}, cobj2 = {}) {
        for (let [k, v] of Object.entries(cobj2)) {
            cobj1[k] = Math.max(cobj1[k] || 0, v);
        }
        return cobj1;
    }*/

    shout() {
        this.docFeeds.transient.extension('shout', Buffer.from(''));
    }

    _tuneInForShouts() {
        this.crowd.on('feed:extension', (feed, {name, msg, peer}) => {
            if (name === 'shout') {
                console.log(`${name} %c${keyHexShort(feed)}`, 'color: green;');
                this.emit('shout');
            }
        });
    }

}



export { DocumentClient }
