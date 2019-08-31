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
                await this.create({extensions: ['shout']}, {type, transitive: false}, false);
        // Listen for shouts
        d.transient.on('extension', (name, msg, peer) => {
            console.log(name, peer.stream.stream.id);
            if (name === 'shout') this.emit('shout');
        });
    }

    shout() {
        for (let f of this.crowd.remoteFeeds) {
            if (f.meta.type === 'docsync')
                f.extension('shout', Buffer.from(''));
        }
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
    Object.assign(window, {c1, c2});
}



async function createDocument() {
    await c1.init();

    c1.sync.create('d1');
    c1.sync.change('d1', d => { d.name = "meg"; d.cards = []; });
}


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
    var slot = app.vue.$refs.pad.slot;
    slot.get() || slot.set({operations: ['[{"o":["a"]}]'], cursors: {}});

    //slot = app.vue.$refs.otherPad.slot;  // create a fork
    c1.sync.docs.setDoc('d2', automerge.merge(automerge.init(), c1.sync.docs.getDoc('d1')));

    var ds = c1.sync.docs;

    function sync12() {
        ds.setDoc('d1', automerge.merge(ds.getDoc('d1'), ds.getDoc('d2')));
    }

    function sync21() {
        ds.setDoc('d2', automerge.merge(ds.getDoc('d2'), ds.getDoc('d1')));
    }

    Object.assign(window, {sync12, sync21});
}


async function main_syncpad() {
    var c1 = new DocumentClient();

    var app = App.start().attach(c1);

    await c1.init();

    var slot1 = c1.sync.path('d1', ['firepad']);
    app.vue.$refs.pad.slot = slot1;
    var slot2 = c1.sync.path('d2', ['firepad']);
    app.vue.$refs.otherPad.slot = slot1;

    process.nextTick(() => {
        var pad1 = app.vue.$refs.pad.pad, pad2 = app.vue.$refs.otherPad.pad;
        pad1.firepad.setUserId('pad1');
        pad2.firepad.setUserId('pad2');
        Object.assign(window, {pad1, pad2});
    });

    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1, createText});

    //createText();
}



if (typeof process !== 'undefined' && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    const automerge = require('automerge'),
          video = require('./src/addons/video'),
          screen = require('./src/addons/share-screen'),
          fssync = require('./src/addons/fs-sync'),
          syncpad = require('./src/ui/syncpad'),
          firepad = require('firepad-core');
    Object.assign(window, {automerge, video, screen, fssync, syncpad,  firepad});

    Object.assign(window, require('./tests/monkey')); // for testing

    Object.assign(window, {main_chat, main_syncdoc, main_syncpad});
}
/*
else
    c1.join('lobby', false); // listen only
*/