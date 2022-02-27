import { EventEmitter } from 'events';
import Automerge from 'automerge';
import { DocSet as DocSetBase, DocWithObservable } from 'automerge-slots';

import _debug from 'debug';
const debug = _debug('automerge-compat');


class DocSet<D = any> extends DocSetBase {

    _mkDoc() { return new DocWithSync<D>(); }

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
                this.emit('change', docId, doc.doc);
            }
            else throw new Error(`receiving changes for doc '${docId}', which does not have a sync`);
        }
    }

    resetSyncState(peerId?: string) {
        for (let [docId, doc] of this.docs.entries()) {
            if (doc instanceof DocWithSync) {
                doc.resetSyncState(peerId);
            }
        }
    }
}

type MultiSyncMessage = Map<string, Automerge.BinarySyncMessage>;

/**
 * Multiplexing messages from multiple documents into a single binary packet.
 */
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
            var k = td.decode(pk.get()), v = pk.get() as Automerge.BinarySyncMessage;
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
    peerId = '*'  /** @todo should probably be unique per connection */
    paused = false
    queue: MultiSyncMessage[] = []
    opts: Connection.Options

    constructor(ds: DocSet<D>, opts?: Connection.Options);
    constructor(ds: DocSet<D>, onData?: Connection.Callback, opts?: Connection.Options);

    constructor(ds: DocSet<D>, onData?: Connection.Callback | Connection.Options, opts?: Connection.Options) {
        super();
        if (typeof onData === 'function') this.on('data', onData);
        else if (typeof onData === 'object') opts ??= onData;

        this.ds = ds;
        this.opts = opts = {sync: false, selfLoop: true, ...opts};

        if (opts?.sync) {
            this.ds.on('change', () => this.notify());
            Promise.resolve().then(() => this.notify());
        }
        else {
            const deferredNotify = deferred(() => this.notify());
            this.ds.on('change', deferredNotify);
            deferredNotify();
        }
    }

    notify() {
        var msg = this.ds.generateSyncMessages(this.peerId);
        if (msg) {
            this._send(msg);
            if  (this.opts.selfLoop)
                this.ds.receiveSyncMessages(this.peerId, msg);
        }
    }

    /** 
     * Used to resync with a newcomer.
     */
    poke() {
        this.ds.resetSyncState(this.peerId); /** @todo probably not the best way to do that? */
        this.notify();
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

namespace Connection {
    export type Callback = (data: MultiSyncMessage) => void;
    export type Options = {sync?: boolean, selfLoop?: boolean};
}

function deferred<T>(op: () => T) {
    var flag = false;
    return () => {
        if (!flag) {
            flag = true;
            Promise.resolve().then(() => { flag = false; op(); });
        }
    };    
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


/**
 * Following `SYNC.md` from Automerge docs.
 */
class DocWithSync<D> extends DocWithObservable<D> {
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
        if (!peerId) return Automerge.initSyncState();
        var v = this.syncStates.get(peerId);
        if (!v) this.syncStates.set(peerId, v = Automerge.initSyncState());
        return v;
    }

    resetSyncState(peerId?: string) {
        if (peerId) this.syncStates.delete(peerId)
        else this.syncStates.clear();
    }
}


export { DocSet, Connection, DocWithSync }
