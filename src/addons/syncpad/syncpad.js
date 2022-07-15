import assert from 'assert';
import _ from 'lodash';
import through2 from 'through2';
import uuid from 'uuid';
import automerge from 'automerge';
import { FirepadCore, TextOperation } from 'firepad-core';

import { FirepadTreeMerge } from './firepad-conflow';
import './syncpad.css';



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
     *   doc that will be used to store and synchronize the text
     * @param {object} opts options passed to FirepadCore and/or EditorState
     */
    constructor(editor, slot, opts={}) {
        this.editor = this._initializeEditor(editor, opts);
        this.slot = slot;

        this.firepad = new FirepadCore(this.editor, opts);

        this.user = opts.id ?? uuid.v4().slice(0, 8);
        this.firepad.serverAdapter.setUserId(this.user);

        this.tm = undefined;
        this._outbox = undefined;
        this._active = true;

        this._ready = (this._park = slot.park()).then(() => {
            if (this._active) this._formLink();
            else throw new Error('syncpad cancelled'); 
        });
    }

    destroy() {
        this._active = false;
        if (this._park)             this._park.cancel();
        if (this.fpHandler)         this.firepad.off('data', this.fpHandler);
        if (this.amHandler)         this.amHandler.unregister();
        if (this._debouncedPatch)   this._debouncedPatch.cancel();
        this.firepad.onBlur();
        this.firepad.dispose();
    }

    get ready() { return this._ready; }
    get active() { return this._active; }

    /**
     * Creates a new document at the slotted location.
     * @param {string} withText initial text value (default: '')
     */
    new(withText) {
        this.slot.set(FirepadShare.fromText(withText));
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
        
        const objIdFor = (obj, prop) => {
            obj = _.isObject(obj) ? obj[prop] : false;
            if (!obj) throw new Error(`[SyncPad] expected property '${prop}' is missing`);
            return automerge.Frontend.getObjectId(obj);
        };

        const obj = this.slot.get(),
              objIds = {operations: objIdFor(obj, 'operations'),
                        cursors:    objIdFor(obj, 'cursors')};

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
            if (data.cursor) {
                process.nextTick(() =>
                    this.slot.change(o => o.cursors[this.user] = data.cursor,
                                     newRev => this.amHandler.skipFwd(newRev)));
            }
        };
        this.firepad.on('data', this.fpHandler);

        this.firepad.serverAdapter.on('retire', u =>
            this.slot.change(o => delete o.cursors[u]));

        // - try to be nice and destroy cursor before navigating away
        window.addEventListener('beforeunload', () => this.firepad.onBlur());

        // Automerge -> Firepad
        this._populate(obj.operations, obj.cursors);

        this.amHandler = registerHandlerObjs(this.slot, Object.values(objIds),
            (newVal, oldVal, newRev, oldRev, changes) => {
                var diff = [].concat(...changes.map(co => co.ops));
                debouncedPatch(newVal, diff);
            });

        const debouncedPatch = debounceQueue((values, diff) => {
            //let userId = this.firepad.serverAdapter.userId_;
            let elemIds = undefined, lastIndex = -1;
            for (let entry of diff) {
                if (entry.obj === objIds.operations && entry.action === 'set') {
                    elemIds ??= automerge.Frontend.getElementIds(values.operations); /* lazy */
                    var index = patchIndexOf(elemIds, entry);
                    if (!(index > lastIndex))  /* the assertion below sometimes fails and I was unable to figure out why */
                        console.warn('patchIndexOf', elemIds, entry, index);
                    assert(index > lastIndex); /* one can only hope that within a single patch, changes arrive in ascending order... */
                    if (entry.insert) {
                        //console.log(entry.index, entry.value, `(${userId})`);
                        var elemId = elemIds[index],
                            operation = {id: elemId, v: JSON.parse(entry.value)};
                        operation = this.tm.insert(index, operation);
                        this.firepad.data({operation});
                        this._maybeReject();
                    }
                    else {
                        //console.log(entry.index, '-', entry.value, `(${userId})`);
                        var elemId = entry.elemId,
                            operation = {id: elemId, v: JSON.parse(entry.value)};
                        assert(index >= 0);
                        this.tm.rebased(index, operation)
                    }
                    lastIndex = index;
                }
                else if (entry.obj === objIds.cursors && entry.action === 'makeMap') {
                    let cursor = values.cursors[entry.key];
                    if (cursor) this.firepad.data({cursor});
                }
            }
        }, 50, {maxWait: 500, afterFlush: () => {
            this._rebase();
            this._maybeAccept();
        } });

        this._debouncedPatch = debouncedPatch;

        // Restore cursor and scroll if needed
        if (this._restoreUI) { this._restoreUI(); this._restoreUI = undefined; }
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
        /* @note path `syncpad` is hard-coded rather than being taken from `slot` */
        for (let o of rev.syncpad?.operations ?? []) {
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

    _initializeEditor(editor, opts) {
        // note: lazily `require()` only the version of CodeMirror that is used.
        // CodeMirror cannot be imported when running in Node.js, as it uses `navigator`.
        switch (opts.type ?? editor.constructor.name) {
        case 'CodeMirror':  // v5
        case 'CodeMirror5':
            let CodeMirror = require('codemirror');
            if (opts.pin) this._cm5pin(editor);
            editor.swapDoc(new CodeMirror.Doc('', opts.mode ?? editor.getOption('mode')));
            break;
        case 'EditorView':  // v6
        case 'CodeMirror6':
            let { EditorState } = require('@codemirror/state');
            if (opts.pin) console.warn('[SyncPad] `opts.pin` not implemented for cm6');
            editor.setState(EditorState.create({extensions: opts.extensions}));
            break;
        }
        return editor;
    }

    _cm5pin(editor) {
        /** store document state for later retrieval, when the edited document is identical */
        let doc = editor.getDoc(), si = editor.getScrollInfo(), pos = editor.getCursor();
        this._restoreUI = () => {
            assert(editor.getValue() == doc.getValue());
            editor.swapDoc(doc); editor.setCursor(pos); editor.scrollTo(si.left, si.top);
        };
    }

    _populate(operations, cursors) {
        assert(!this.tm);
        assert(this.editor.state?.doc ? this.editor.state.doc.length === 0
                                      : this.editor.getValue() === '');

        this.tm = FirepadTreeMerge.from(this._withIds(operations));
        this.firepad.data({operation: this.tm.recompose()});

        for (let cursor of Object.values(cursors))
            this.firepad.data({cursor});
    }
}


class FirepadShare {
    constructor(operations=[], cursors={}) {
        this.$type = 'FirepadShare';
        this.operations = operations;
        this.cursors = cursors;
    }

    clone() {
        return new FirepadShare([...this.operations], {...this.cursors});
    }

    static from(props) {
        return new FirepadShare(props.operations, props.cursors);
    }

    static fromText(text) {
        var o = text ? [[{o: new TextOperation().insert(text)}]] : [];
        return new FirepadShare(o.map(JSON.stringify));
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
        var changes = automerge.getChanges(lastRev, newRev).map(b => automerge.decodeChange(b)),
            prev = lastRev;
        lastRev = newRev;  /* this has to occur *before* handler (async race!) */
        handler(newRev, prev, changes);
    });
    return {
        unregister() { docSlot.unregisterHandler(h); },
        skipFwd(rev) { lastRev = rev; }
    };
}

function registerHandlerObjs(slot, objectIds, handler) {
    return registerHandlerWithChanges(slot.docSlot, 
        (newDoc, oldDoc, changes) => {
            changes = changes.filter(x => x.ops &&
                                     x.ops.some(o => objectIds.includes(o.obj)));
            if (changes.length > 0) {
                handler(slot.getFrom(newDoc), slot.getFrom(oldDoc), newDoc, oldDoc, changes);
            }
        });
}

/** auxiliary function to interpret diff entries */
function patchIndexOf(elemIds, op) {
    if (op.elemId === '_head') {
        assert(op.insert);
        return 0;
    }
    else {
        var index = elemIds.indexOf(op.elemId);
        if (op.insert) index++;
        return index;
    }
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



export { SyncPad, FirepadShare }
