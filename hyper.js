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
        var useless = (items) => items.every(d => d.docId && d.clock && !d.changes);
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
    await c1.create(); //await c2.create();

    c1.join('doc1'); //c2.join('doc1');

    c1.sync.create('d1');
    c1.sync.change('d1', d => { d.name = "meg"; d.cards = []; });
}


var {SyncPad} = require('./src/ui/syncpad');


function connectDocument(client) {
    if (client.pad) return;
    if (!client.feed) client.create();

    client.pad = new SyncPad(app.vue.$refs.pad.cm, client.sync.docs);
}

function main_syncpad() {
    var c1 = new DocumentClient();
    var c2 = new DocumentClient();
    
    c1.deferred.init.then(() => {
        if (!c1.pad) {
            app.vue.$refs.pad.cm.setValue('wait for it...');

            c1.create();

            c1.sync.docs.registerHandler((id, doc) => {
                if (!c1.pad && id === 'syncpad' && doc.text) {
                    setTimeout(() => connectDocument(c1), 500);
                }
            });
        }
    });

    App.start().attach(c1);

    Object.assign(window, {c1, c2, connectDocument});
}


window.automerge = require('automerge');



if (typeof process !== 'undefined' && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    Object.assign(window, {main_chat, main_syncpad});
}
/*
else
    c1.join('lobby', false); // listen only
*/