import { EventEmitter } from 'events';
import Automerge, { BinarySyncMessage, Uint } from 'automerge';

import _debug from 'debug';
const debug = _debug('automerge-compat');


class DocSet<D = any> extends EventEmitter {
    docs = new Map<string, DocWithObervable<D>>()

    syncStates = new Map<string, Automerge.SyncState>()

    createDoc(docId: string) {
        return this._createDoc(docId).doc;
    }

    getDoc(docId: string) {
        return this.docs.get(docId)?.doc;
    }

    setDoc(docId: string, d: Automerge.Doc<D>) {
        var ed = this.docs.get(docId);
        if (ed) ed.doc = d;
        else throw new Error("cannot set doc without observable");  // @todo allow non-observed docs as well?
        this.emit('change', docId, d);
    }

    _createDoc(docId: string) {
        var newDoc = new DocWithSync<D>();
        this.docs.set(docId, newDoc);
        this.emit('change', docId, newDoc.doc);
        return newDoc;
    }

    generateSyncMessages(peerId: string) {
        var msgs = new Map<string, Automerge.BinarySyncMessage>();
        for (let [docId, doc] of this.docs.entries()) {
            if (doc instanceof DocWithSync) {
                var msg = doc.generateSyncMessages(peerId);
                if (msg) msgs.set(docId, msg);
            }
        }
        return msgs.size > 0 ? msgs : null;
    }

    receiveSyncMessages(peerId: string, msgs: MultiSyncMessage) {
        for (let [docId, msg] of msgs.entries()) {
            var doc = this.docs.get(docId) || this._createDoc(docId);
            if (doc instanceof DocWithSync) {
                doc.receiveSyncMessages(peerId, msg);
            }
            else throw new Error(`receiving changes for doc '${docId}', which does not have a sync`);
        }
    }

    observe<O>(docId: string, object: O, callback: Automerge.ObserverCallback<O>) {
        var entry = this.docs.get(docId);
        entry.observable.observe(object, callback);
    }

    registerHandler(handler: (docId: string, doc: Automerge.FreezeObject<D>) => void) {
        var hooks = handler[DocSet.HOOK] = [],
            hookup = <T>(t: T) => { hooks.push(t); return t; },
            stillOn = () => handler[DocSet.HOOK] === hooks;
        for (let [docId, entry] of this.docs.entries()) {
            entry.observable.observe(entry.doc,
                hookup((diff, oldRev, newRev) => 
                    stillOn() && handler(docId, newRev)))
        }
    }

    unregisterHandler(handler: (docId: string, doc: Automerge.FreezeObject<D>) => void) {
        /** @oops no way to unobserve in automerge? */
        // for (let hook of handler[DocSet.HOOK] ?? []) { ... }
        delete handler[DocSet.HOOK];
    }

    static HOOK = Symbol('DocSet.HOOK')
}

type MultiSyncMessage = Map<string, Automerge.BinarySyncMessage>;

namespace MultiSyncMessage {

    export function encode(msg: MultiSyncMessage): Uint8Array {
        var pk = new BinaryPacking(null), entries = [], te = new TextEncoder;
        for (let [k, v] of msg.entries()) {
            var bk = te.encode(k); entries.push([bk, v]);
            pk.dry(bk); pk.dry(v);
        }
        pk = new BinaryPacking(new Uint8Array(pk.cur));
        for (let [k, v] of entries) {
            pk.put(k); pk.put(v);
        }
        return pk.buf;
    }

    export function _decode(data: Uint8Array): MultiSyncMessage {
        var pk = new BinaryPacking(data), msg: MultiSyncMessage = new Map, td = new TextDecoder;
        while (!pk.eof()) {
            var k = td.decode(pk.get()), v = pk.get() as BinarySyncMessage;
            v.__binarySyncMessage = true;
            msg.set(k, v);
        }
        return msg;
    }

}

/**
 * Compatibility class.
 */
class Connection<D = any> extends EventEmitter {
    ds: DocSet<D>
    peerId = '*'
    paused = false
    queue: MultiSyncMessage[] = []

    constructor(ds: DocSet<D>, onData?: (data: MultiSyncMessage) => void) {
        super();
        this.ds = ds;
        if (onData) this.on('data', onData);
    }

    open() {
        this.ds.on('change', () => this.notify());
        Promise.resolve().then(() => this.notify());
    }

    notify() {
        var msg = this.ds.generateSyncMessages(this.peerId);
        if (msg)
            this._send(msg);
    }

    data(data: Uint8Array) {
        var msg = this._decode(data);
        debug('received message', msg);
        this.ds.receiveSyncMessages(this.peerId, msg);
        this.notify();
    }

    receiveMsg(data: Uint8Array) { this.data(data); }

    pause() { this.paused = true; }

    resume() {
        this.paused = false;
        for (var msg: MultiSyncMessage; msg = this.queue.shift(); )
            this._send(msg);
    }

    _send(msg: MultiSyncMessage) {
        if (!this.paused) {
            debug('sending message', msg);
            this.emit('data', this._encode(msg));
        }
        else this.queue.push(msg);
    }
    
    _encode(msg: MultiSyncMessage): Uint8Array {
        return MultiSyncMessage.encode(msg);
    }

    _decode(data: Uint8Array): MultiSyncMessage {
        return MultiSyncMessage._decode(data);
    }
}

/**
 * Handles packing buffers into a binary message and unpacking them.
 * Should probably use some existing package... but this is small enough.
 */
class BinaryPacking {
    cur: number
    view: DataView

    constructor(public buf: Uint8Array, start = 0) {
        this.cur = start;
        this.view = buf && new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    }

    get() {
        var sz = this.view.getUint32(this.cur, true),
            buf = this.buf.slice(this.cur + 4, this.cur + 4 + sz);
        this.cur += 4 + sz;
        return buf;
    }

    eof() { return this.cur >= this.buf.length; }

    put(buf: Uint8Array) {
        this.view.setUint32(this.cur, buf.length, true);
        this.buf.set(buf, this.cur + 4);
        this.cur += 4 + buf.length;
    }

    dry(buf: Uint8Array) {
        this.cur += 4 + buf.length;
    }
}


class DocWithObervable<D> {
    doc: Automerge.Doc<D>
    observable = new Automerge.Observable()

    constructor() {
        this.doc = Automerge.init<D>({observable: this.observable});
    }
}

/**
 * Following `SYNC.md` from Automerge docs.
 */
class DocWithSync<D> extends DocWithObervable<D> {
    syncStates = new Map<string, Automerge.SyncState>()

    generateSyncMessages(peerId: string) {
        var [newState, msg] = Automerge.generateSyncMessage(
            this.doc, this.getSyncState(peerId));
        this.syncStates.set(peerId, newState);
        return msg;
    }

    receiveSyncMessages(peerId: string, msg: Automerge.BinarySyncMessage) {
        var [newDoc, newState] = Automerge.receiveSyncMessage(
            this.doc, this.getSyncState(peerId),
            msg
        );
        this.doc = newDoc;
        this.syncStates.set(peerId, newState);
        return [newDoc, newState];
    }

    getSyncState(peerId: string) {
        var v = this.syncStates.get(peerId);
        if (!v) this.syncStates.set(peerId, v = Automerge.initSyncState());
        return v;
    }
}


export { DocSet, Connection, DocWithObervable, DocWithSync }
