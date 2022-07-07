import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import _ from 'lodash';
import mergeOptions from 'merge-options';
import cuid from 'cuid';
import automerge from 'automerge';
import { DocSet, Connection } from '../sync/automerge-compat';
import { DocumentSlot } from 'automerge-slots';



const DEFAULT_OPTIONS = {
    opsThreshold: 128  /* split messages with more than this many ops */
};


class DocSync extends EventEmitter {
    constructor(opts) {
        super();

        this.opts = mergeOptions(DEFAULT_OPTIONS, opts);

        this.docs = new DocSet();
        this.protocol = new Connection(this.docs, msg => this.sendMsg(msg));

        this.docs.registerHandler((docId, doc) => this._onSetDoc(docId, doc));        
    }

    sendMsg(msg) {
        for (let chunk of splitAutomergeChanges(msg, this.opts.opsThreshold))
            this.emit('data', chunk);
    }

    data(msg) {
        this.protocol.receiveMsg(msg);
    }

    create(docName = cuid()) {
        this.docs.createDoc(docName);
        return new DocumentSlot(this.docs, docName);
    }

    ls() {
        return [...this.docs.docs.keys()];
    }

    has(docName) {
        return !!this.docs.getDoc(docName);
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
            filename = filename.replace(/^file:\/\//, '');
            fs.writeFileSync(filename, saved);
        }
        return saved;
    }

    restore(docName, snapshot) {
        if (typeof snapshot === 'string') {
            snapshot = fs.readFileSync(snapshot);
        }
        var doc = automerge.load(snapshot);
        this.create(docName).set(doc);
        return doc;
    }

    _onSetDoc(docId, doc) {
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

class DocSyncStorageDirectory {
    constructor(root) {
        this.root = root;
    }

    store(docsync) {
        fs.mkdirSync(this.root, {recursive: true});
        for (let docName of docsync.ls()) {
            docsync.snapshot(docName, path.join(this.root, docName));
        }
    }

    restore(docsync) {
        try {
            var ls = fs.readdirSync(this.root);
        }
        catch { return; /* directory does not exist */ }

        for (let docName of ls) {
            if (!docName.startsWith('.')) {
                try {
                    docsync.restore(docName, path.join(this.root, docName));
                }
                catch (e) {
                    console.warn(`[docsync] failed to restore document '${docName}';`, e);
                }
            }
        }
    }

    autosave(docsync, opts = {immediate: false, wait: 5000}) {
        if (opts.immediate) this.store(docsync);
        docsync.on('change', _.throttle(() => {
            console.log('- autosave -');
            this.store(docsync);
        }, opts.wait ?? 5000));
    }
}


export { DocSync, DocSyncStorageDirectory }