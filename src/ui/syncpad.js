const _ = require('lodash'),
      assert = require('assert'),
      through2 = require('through2');

const automerge = require('automerge'),
      {FirepadCore} = require('firepad-core'),
      {FirepadTreeMerge} = require('../addons/firepad-conflow');




/**
 * Synchronizes a CodeMirror editor instance with an Automerge object.
 * The object contains a list property (named `operations`) which gets
 * populated with `TextOperation`s, serialized via `toJSON`.
 * A sub-object `cursors` holds active user cursors (@todo still not implemented).
 */
class SyncPad {
    /**
     * Creates a synchronized link based on an existing CodeMirror instance.
     * If the editor contains text, it is cleared and replaced by the most recent
     * contents of the document.
     * @param {CodeMirror.Editor} editor a CodeMirror editor instance
     * @param {DocumentSlotInterface} slot references an object in an Automerge
     *   doc that will be used to stored and synchronize the text
     * @param {object} opts options passed to FirepadCore
     */
    constructor(editor, slot, opts={}) {
        this.editor = editor;
        this.slot = slot;

        this.firepad = new FirepadCore(this.editor, opts);
        this.tm = new FirepadTreeMerge();

        this._outbox = undefined;

        (this._park = slot.park()).then(() => this._formLink());
    }

    destroy() {
        if (this._park)             this._park.cancel();
        if (this.fpHandler)         this.firepad.off('data', this.fpHandler);
        if (this.amHandler)         this.amHandler.unregister();
        if (this._debouncedPatch)   this._debouncedPatch.cancel();
        this.firepad.dispose();
    }

    get ready() {
        return this._park || Promise.resolve();
    }

    /**
     * Creates a text write stream, where writes are appended to the
     * document.
     * @param {boolean} autodestruct destroy the pad when the stream ends
     *   (default: true).
     */
    createWriteStream(autodestruct=true) {
        return through2.obj((chunk, enc, cb) => {
            try {
                this.editor.replaceRange(chunk, {line: Infinity});
                cb(); // notice: chunk is consumed
            }
            catch (e) { cb(e); }
        })
        .on('error', () => { if (autodestruct) this.destroy(); })
        .on('finish', () => { if (autodestruct) this.destroy(); });
    }

    _formLink() {
        this._park = undefined;
        
        const slotFor = (obj) => this.slot.object(obj);

        const obj = this.slot.get(),
              subslots = {operations: slotFor(obj.operations),
                          cursors:    slotFor(obj.cursors)};

        // Firepad -> Automerge
        this.fpHandler = (data) => {
            if (data.operation) {
                assert(!this._outbox);
                
                //let userId = this.firepad.serverAdapter.userId_;
                //console.log('operation', userId, JSON.stringify(data.operation));

                data.preventDefault(); // postpone 'ack'
                this._outbox = data;
                process.nextTick(() => {
                    debouncedPatch.flush();
                    this._maybeAccept();
                });
            }
        };
        this.firepad.on('data', this.fpHandler);

        // Automerge -> Firepad
        this._populate(obj.operations);

        this.amHandler = registerHandlerObj(subslots.operations, 
            (newVal, newRev, oldRev, changes) => {
                var diff = patchFromChanges(oldRev, changes);
                debouncedPatch(newVal, diff);
                //debouncedPatch.flush();
            });
        
        const debouncedPatch = debounceQueue((values, diff) => {
            //let userId = this.firepad.serverAdapter.userId_;
            for (let entry of diff) {
                if (entry.action === 'insert') {
                    //console.log(entry.index, entry.value, `(${userId})`);
                    var operation = {id: entry.elemId, v: JSON.parse(entry.value)};
                    operation = this.tm.insert(entry.index, operation);
                    this.firepad.data({operation});
                    this._maybeReject();
                }
                else if (entry.action === 'set') {
                    //console.log(entry.index, '-', entry.value, `(${userId})`);
                    var elemId = automerge.Frontend.getElementIds(values)[entry.index],
                        operation = {id: elemId, v: JSON.parse(entry.value)};
                    this.tm.rebased(entry.index, operation)
                }
            }
        }, 50, {maxWait: 500, afterFlush: () => {
            this._rebase();
            this._maybeAccept();
        } });

        this._debouncedPatch = debouncedPatch;
    }

    static _operationsWithIds(values) {
        return _.zip(values, automerge.Frontend.getElementIds(values))
                .map(([value,id]) => ({id, v:JSON.parse(value)}));
    }

    _withIds(values) { return this.constructor._operationsWithIds(values); }

    _tip(values) {
        values = values || this.slot.get().operations;
        assert(values.length > 0);
        return automerge.Frontend.getElementIds(values).slice(-1)[0];
    }

    _push(operation, accept) {
        var reified = this.tm.newOperation(operation);
        reified.v[0].a = this.firepad.serverAdapter.userId_;
        //console.log('push', JSON.stringify(reified.v));
        this.slot.change(o => o.operations.push(JSON.stringify(reified.v)),
                         newRev => {
                             this.amHandler.skipFwd(newRev); 
                             reified.id = this._tip(this.slot.getFrom(newRev).operations);
                             this.tm.push(reified);
                             accept();
                             //this._trace(newRev);
                         });
    }

    _trace(rev, msg='revision') {
        var userId = this.firepad.serverAdapter.userId_;
        console.warn(msg, userId);
        for (let o of rev.firepad.operations) {
            o = o && JSON.parse(o)[0]; o = o && {o:o.o, a:o.a};
            console.log(`${JSON.stringify(o)}`);
        }
    }

    _rebase() {
        this.slot.change(o => {
            for (let [index, newRev] of this.tm.rebase()) {
                let v = JSON.parse(o.operations[index]);
                v.push(newRev);
                o.operations[index] = JSON.stringify(v);
            }
        }, newRev => { this.amHandler.skipFwd(newRev); });
    }

    _maybeAccept() {
        if (this._outbox && this.tm.isLinear()) {
            var data = this._outbox;
            this._outbox = undefined;
            this._push(data.operation, () => data.accept());
        }
    }

    _maybeReject() {
        if (this._outbox) {
            var data = this._outbox;
            this._outbox = undefined;
            data.reject();
        }
    }

    _populate(operations) {
        assert(this.tm.operations.length === 0);

        // Start a new doc; this clears history and does not emit 'change'
        this.editor.swapDoc(new CodeMirror.Doc('', this.editor.getOption('mode')));

        for (let [index, entry] of this._withIds(operations).entries()) {
            let operation = this.tm.insert(index, entry);
            this.firepad.data({operation});
        }
    }
}


class FirepadShare {
    constructor(operations=[], cursors={}) {
        this.$type = 'FirepadShare';
        this.operations = operations;
        this.cursors = cursors;
    }

    static from(props) {
        return new FirepadShare(props.operations, props.cursors);
    }

    getValue() {
        return FirepadTreeMerge.from(this._withIds(this.operations))
               .getText();
    }

    _withIds(operations) { return SyncPad._operationsWithIds(operations); }
}


/* -- Utility functions -- */


function registerHandlerWithChanges(docSlot, handler) {
    var lastRev = docSlot.get() || automerge.init(), h;
    docSlot.registerHandler(h = newRev => {
        var changes = automerge.getChanges(lastRev, newRev),
            p = lastRev;
        lastRev = newRev;
        //try {
            handler(newRev, newRev, p, changes);
        //}
        //finally { if (lastRev === p) lastRev = newRev; }
    });
    return {
        unregister() { docSlot.unregisterHandler(h); },
        skipFwd(rev) { lastRev = rev; }
    };
}

function registerHandlerObj(slot, handler) {
    var objectId = automerge.getObjectId(slot.get());
    return registerHandlerWithChanges(slot.docSlot, 
        (newVal, newDoc, oldDoc, changes) => {
            changes = changes.filter(x => x.ops &&
                                     x.ops.some(o => o.obj === objectId));
            if (changes.length > 0) {
                handler(slot.getFrom(newDoc), newDoc, oldDoc, changes);
            }
        });
}

function patchFromChanges(oldDoc, changes) {
    var oldState = automerge.Frontend.getBackendState(oldDoc);

    return automerge.Backend.applyChanges(oldState, changes)[1].diffs;
}


function debounceQueue(func, wait, options) {
    var queue = [], callback = options.afterFlush;
    const kick = _.debounce(() => {
        while (queue.length) {
            func(...queue.shift());
        }
        // Important: use nextTick here to allow callback to make further
        // calls to debouncer.flush() without recursing.
        if (callback) process.nextTick(() => {
            if (queue.length === 0) callback();
        });
    }, wait, options);
    function debouncer(...args) {
        queue.push(args); kick();
    }
    debouncer.flush = () => kick.flush();
    debouncer.cancel = () => kick.cancel(); // clear queue..?
    return debouncer;
}



module.exports = {SyncPad, FirepadShare};
