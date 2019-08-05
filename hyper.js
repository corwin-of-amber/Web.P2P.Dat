const {FeedClient} = require('./src/net/client'),
      {DocSync} = require('./src/net/merge'),
      {App, PreviewPane} = require('./src/ui/ui');


class DocumentClient extends FeedClient {

    constructor() {
        super();

        this._setupDoc();
    }

    async _setupDoc() {
        this.docFeeds = {};

        this.sync = new DocSync();
        this.sync.on('data', d => {
            var feed = d.changes ? this.docFeeds.changes : this.docFeeds.transient;
            if (feed) feed.append(d);
            else console.warn('DocSync message lost;', d);
        });
        this.on('append', ev => {
            if (ev.feed.meta && ev.feed.meta.type === 'docsync' &&
                !Object.values(this.docFeeds).includes(ev.feed)) {
                this.sync.data(ev.data);
            }
        });
    }

    async _init() {
        await super._init();
        await this._initFeeds();
    }

    async _initFeeds() {
        var d = this.docFeeds, type = 'docsync';
        d.changes = d.changes || await this.create({}, {type}, false);
        d.transient = d.transient ||
                await this.create({}, {type, transitive: false}, false);
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

    c1.sync.create('d1');
    c1.sync.change('d1', d => { d.name = "meg"; d.cards = new automerge.Text(); });
}


var {DocumentSlot, DocumentPathSlot} = require('./src/core/doc-slots');


function main_syncdoc() {
    var c1 = new DocumentClient();

    var app = App.start().attach(c1),
        preview = new PreviewPane(app);

    app.vue.$refs.documents.$on('select', async (ev) => {
        var slot = c1.sync.object(ev.docId, ev.target.object);
        preview.zoomObject(ev.target, slot);
    });

    const {DirectorySync} = require('./src/addons/fs-sync');

    var ds = new DirectorySync(c1.sync.path('d1', ['files']), '/tmp/dirsync');

    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1, ds, createDocument});
}



async function createText() {
    await c1.init();
    //if (!c1.feed) await c1.create();

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



if (typeof process !== 'undefined' && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    const automerge = require('automerge'),
          video = require('./src/addons/video'),
          screen = require('./src/addons/share-screen'),
          fssync = require('./src/addons/fs-sync');
    Object.assign(window, {automerge, video, screen, fssync});

    Object.assign(window, require('./tests/monkey')); // for testing

    Object.assign(window, {main_chat, main_syncdoc, main_syncpad});
}
/*
else
    c1.join('lobby', false); // listen only
*/