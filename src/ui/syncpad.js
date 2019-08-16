const {FirepadCore, TextOperation} = require('firepad-core');

const _ = require('lodash');



/**
 * Synchrinizes a CodeMirror editor instance with an Automerge object.
 * The object contains a list property (named `operations`) which gets
 * populated with `TextOperation`s, serialized via `toJSON`.
 * A sub-object `cursors` holds active user cursors (@todo still not implemented).
 */
class SyncPad {

    constructor(editor, slot, opts={}) {
        this.editor = editor;
        this.slot = slot;

        this.firepad = new FirepadCore(editor, opts);

        (this._park = slot.park()).then(obj => this._formLink(obj));
    }

    destroy() {
        if (this._park) this._park.cancel();
        if (this.fpHandler) this.firepad.off('data', this.fpHandler);
        if (this.amFlush)   this.editor.off('beforeChange', this.amFlush);
        if (this.amHandler) this.amHandler.unregister();
    }

    _formLink(obj) {
        this._park = undefined;
        
        const slotFor = (obj) => this.slot.object(automerge.getObjectId(obj));

        const subslots = {operations: slotFor(obj.operations),
                          cursors:    slotFor(obj.cursors)};

        for (let op of obj.operations)
            this._pull(op);

        // Firepad -> Automerge
        this.fpHandler = (data) => {
            if (data.operation)
                this._push(data.operation);
        };
        this.firepad.on('data', this.fpHandler);

        this.editor.on('beforeChange', this.amFlush =
            () => debouncedPatch.flush());
        
        // Automerge -> Firepad
        this.amHandler = registerHandlerObj(subslots.operations, 
            (newVal, newRev, oldRev, changes) => {
                var diff = patchFromChanges(oldRev, changes);
                debouncedPatch(diff);
            });
        
        const debouncedPatch = debounceQueue((diff) => {
            for (let entry of diff) {
                if (entry.action === 'insert')
                    this._pull(entry.value);
            }
        }, 50, {maxWait: 500});
    }

    _push(operation) {
        this.slot.change(o => o.operations.push(JSON.stringify(operation)),
            newRev => { this.amHandler.skipFwd(newRev); });
    }

    _pull(value) {
        this.firepad.data({operation: this._asOperation(value)});
    }

    _asOperation(value) {
        return TextOperation.fromJSON(JSON.parse(value));
    }

}


/* -- Utility functions -- */


function registerHandlerWithChanges(docSlot, handler) {
    var lastRev = docSlot.get() || automerge.init(), h;
    docSlot.registerHandler(h = newRev => {
        var changes = automerge.getChanges(lastRev, newRev);
        try {
            handler(newRev, newRev, lastRev, changes);
        }
        finally { lastRev = newRev; }
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
    var queue = [];
    const kick = _.debounce(() => {
        while (queue.length) {
            func(...queue.shift());
        }
    }, wait, options);
    function debouncer(...args) {
        queue.push(args); kick();
    }
    debouncer.flush = () => kick.flush();
    debouncer.cancel = () => kick.cancel(); // clear queue..?
    return debouncer;
}



module.exports = {SyncPad};
