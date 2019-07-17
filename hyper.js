const {FeedClient} = require('./src/net/client'),
      {DocSync} = require('./src/net/merge');



class DocumentClient extends FeedClient {

    constructor() {
        super();

        this._setupDoc();
    }

    _setupDoc() {
        this.sync = new DocSync();
        this.sync.on('data', d => {
            if (this.feed) this.feed.append(d);
        });
        this.on('append', ev => {
            if (!this.localFeeds.includes(ev.feed)) {
                this.sync.data(ev.data);
            }
        });
    }
}


var c1 = new DocumentClient();
var c2 = new DocumentClient();



async function createDocument() {
    await c1.create(); await c2.create();

    c1.join('doc1'); c2.join('doc1');

    c1.sync.create('d1');
    c1.sync.change('d1', d => { d.name = "meg"; d.cards = []; });
}



if (typeof process !== 'undefined' && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    if (typeof App === 'undefined') {
        Object.assign(window, require('./src/ui/ui'));
    }
    window.addEventListener('beforeunload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2, createDocument});
}
else
    c1.join('lobby', false); // listen only
