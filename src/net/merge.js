const automerge = require('automerge'),
      {EventEmitter} = require('events'),
      {DocumentSlot} = require('../core/doc-slots');


class DocSync extends EventEmitter {
    constructor() {
        super();
        this.docs = new automerge.DocSet();
        this.protocol = new automerge.Connection(this.docs, msg => this.sendMsg(msg));
        this.protocol.open();

        this.docs.registerHandler((docId, doc) => this._onSetDoc(docId, doc));        
    }

    sendMsg(msg) {
        this.emit('data', msg);
    }

    data(msg) {
        this.protocol.receiveMsg(msg);
    }

    create(docName) {
        var doc = automerge.init();
        this.docs.setDoc(docName, doc);
        return new DocumentSlot(this.docs, docName);
    }

    path(docName, path=[]) {
        return new DocumentSlot(this.docs, docName).path(path);
    }

    change(docName, operation) {
        var doc = this.docs.getDoc(docName);
        if (!doc) throw new Error(`document missing: '${docName}'`);
        doc = this.docs.setDoc(docName, automerge.change(doc, operation));
        return doc;
    }

    snapshot(docName, filename) {
        var saved = automerge.save(this.path(docName).get());
        if (filename) {
            var fs = (0 || require)('fs');
            filename = filename.replace(/^file:\/\//, '');
            fs.writeFileSync(filename, saved);
        }
        return saved;
    }

    restore(docName, snapshot) {
        let mo = snapshot.match(/^file:\/\/(.*)$/);
        if (mo) {
            var fs = (0 || require)('fs');
            snapshot = fs.readFileSync(mo[1]);
        }
        var doc = automerge.load(snapshot);
        this.path(docName).set(doc);
        return doc;
    }

    _onSetDoc(docId, doc) {
        //console.log('document modified:', docId, doc);
        this.emit('change', {id: docId, doc});
    }
}

/*
var s1 = new DocSync(), s2 = new DocSync();

s1.on('data', x => { console.log(1, x); s2.data(x); });
s2.on('data', x => { console.log(2, x); s1.data(x); });

s1.create('d1');
s1.change('d1', d => d.cards = []);
*/

if (typeof module !== 'undefined')
    module.exports = {DocSync};
