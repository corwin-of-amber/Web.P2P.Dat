const automerge = require('automerge'),
      {EventEmitter} = require('events'),
      {DocumentSlot} = require('automerge-slots'),
      mergeOptions = require('merge-options');



const DEFAULT_OPTIONS = {
    opsThreshold: 128  /* split messages with more than this many ops */
};


class DocSync extends EventEmitter {
    constructor(opts) {
        super();

        this.opts = mergeOptions(DEFAULT_OPTIONS, opts);

        this.docs = new automerge.DocSet();
        this.protocol = new automerge.Connection(this.docs, msg => this.sendMsg(msg));
        this.protocol.open();

        this.docs.registerHandler((docId, doc) => this._onSetDoc(docId, doc));        
    }

    sendMsg(msg) {
        for (let chunk of splitAutomergeChanges(msg, this.opts.opsThreshold))
            this.emit('data', chunk);
    }

    data(msg) {
        this.protocol.receiveMsg(msg);
    }

    create(docName) {
        var doc = automerge.init();
        this.docs.setDoc(docName, doc);
        return new DocumentSlot(this.docs, docName);
    }

    path(docName, ...path) {
        return new DocumentSlot(this.docs, docName).path(...path);
    }

    object(docName, objectId) {
        if (typeof objectId === 'object')
            objectId = automerge.getObjectId(objectId);
        return new DocumentSlot(this.docs, docName).object(objectId);
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

/**
 * 
 * @param {object} message an Automerge.Connection message
 * @param {number} opsThreshold start a new message whenever the number of
 *    operations exceeds this threshold.
 *    Each chunk may contain multiple changes. If a single change contains
 *    more than opsThreshold ops, it is still sent whole, occupying its own
 *    chunk.
 */
function* splitAutomergeChanges(message, opsThreshold) {
    if (!message.changes) { yield message; return; }

    function adjustClock(clock, change) {
        var override = {};
        override[change.actor] = change.seq;
        return Object.assign({}, clock, override);
    }

    function mkchunk() {
        return Object.assign({}, message, {changes: []});
    }

    var chunk = mkchunk(), ops = 0;

    for (let change of message.changes) {
        if (ops > 0 && ops + change.ops.length > opsThreshold) {
            yield chunk;
            chunk = mkchunk(); ops = 0;
        }
        chunk.changes.push(change);
        chunk.clock = adjustClock(chunk.clock, change);
        ops += change.ops.length;
    }

    if (ops > 0) yield chunk;
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
