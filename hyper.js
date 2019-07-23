const {FeedClient} = require('./src/net/client'),
      {DocSync} = require('./src/net/merge'),
      {App} = require('./src/ui/ui');


class DocumentClient extends FeedClient {

    constructor() {
        super();

        this._setupDoc();
    }

    async _setupDoc() {
        this.sync = new DocSync();
        this.sync.on('data', d => {
            var feed = d.changes ? this.feed : this.transientFeed;
            if (feed) feed.append(d);
        });
        this.on('append', ev => {
            if (!this.localFeeds.includes(ev.feed)) {
                this.sync.data(ev.data);
            }
        });
    }

    async _init() {
        await super._init();
        await this._initFeeds();
    }

    async _initFeeds() {
        this.transientFeed = this.transientFeed ||
            await this.create({}, {transitive: false}, false);
    }

    /**
     * Drops remote feeds that contain only clock events without changes.
     */
    async _cleanup() {
        var useless = (items) =>        /* clock may be `null` */
            items.every(d => d.docId && (d.clock !== undefined) && !d.changes);
        var stillUseful = Promise.all(this.remoteFeeds.map(async feed => {
            if (!useless(await this._feedGetAll(feed))) return feed;
        }));
        this.remoteFeeds = (await stillUseful).filter(x => x);
    }    
}


function main_chat() {
    var c1 = new FeedClient();
    var c2 = new FeedClient();

    App.start().attach(c1);

    window.addEventListener('beforeunload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2}); //, createDocument, connectDocument, SyncPad});
}



async function createDocument() {
    await c1.init();
    if (!c1.feed) await c1.create();

    c1.sync.create('d1');
    c1.sync.change('d1', d => { d.name = "meg"; d.cards = new automerge.Text(); });
}


var {DocumentSlot, DocumentPathSlot, DocumentObjectSlot} = require('./src/ui/syncpad');


function main_syncdoc() {
    var c1 = new DocumentClient();

    App.start().attach(c1);

    app.vue.$refs.documents.$on('select', (ev) => {
        console.log('select', ev);
        var docSlot = new DocumentSlot(c1.sync.docs, ev.docId),
            slot = new DocumentObjectSlot(docSlot, automerge.getObjectId(ev.target.object));
        app.vue.$refs.pad.slot = slot;
        app.vue.$refs.pad.$parent.open = true;
    });

    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1, createDocument});
}



async function createText() {
    await c1.create();

    var slot = app.vue.$refs.pad.slot;
    slot.docSlot.get() || slot.docSlot.create();
    slot.set(new automerge.Text());
}

function main_syncpad() {
    var c1 = new DocumentClient();
    var c2 = new DocumentClient();

    var docSlot = new DocumentSlot(c1.sync.docs, 'syncpad'),
        slot = new DocumentPathSlot(docSlot, ['text']);

    var app = App.start().attach(c1);
    app.vue.$refs.pad.slot = slot;

    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1, c2, createText});
}


window.automerge = require('automerge');



if (typeof process !== 'undefined' && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    Object.assign(window, {main_chat, main_syncdoc, main_syncpad});
}
/*
else
    c1.join('lobby', false); // listen only
*/