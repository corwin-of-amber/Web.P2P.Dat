
const _ = require('lodash'),
      automerge = require('automerge');



class SyncPad {

    constructor(cm, slot, opts={}) {
        this.cm = cm;
        this.slot = slot;

        this._park = () => {
            if (this.slot.get()) {
                this.slot.docSlot.unregisterHandler(this._park);
                this._park = null;
                this._formLink(opts);
            }
        };
        this.slot.docSlot.registerHandler(this._park);
        this._park();
    }

    destroy() {
        if (this._park) this.slot.docSlot.unregisterHandler(this._park);
        if (this.amHandler) this.slot.docSlot.unregisterHandler(this.amHandler);
        if (this.cmHandler) this.cm.off('change', this.cmHandler);
    }

    _formLink(opts) {
        var doc = this.slot.docSlot.get() || this.slot.docSlot.create();
        if (!this.slot.get()) this.slot.set(new automerge.Text());

        this._objectId = automerge.getObjectId(this.slot.get());
        this._actorId = automerge.getActorId(doc);

        var debounce = this._debounceOpts(opts);

        var {cm, slot} = this;

        // Synchronize CodeMirror -> Automerge
        cm.setValue(slot.get().join(''));

        this.cmHandler = (cm, change) => {
            updateAutomergeDoc(slot, cm.getDoc(), change);
        };

        cm.on('change', this.cmHandler);

        // Synchronize Automerge -> CodeMirror
        this.lastRev = doc;

        this.amHandler = _.debounce(newRev => {
            updateCodeMirrorDocs(this.lastRev, newRev, 
                                 this._objectId, this._actorId, cm.getDoc());
            this.lastRev = newRev;
        }, debounce.wait, {maxWait: debounce.max});

        slot.docSlot.registerHandler(this.amHandler);
    }

    _debounceOpts(opts) {
        return {wait: (opts.debounce && opts.debounce.wait) || 50,
                max:  (opts.debounce && opts.debounce.max)  || 500};
    }
}


/**
 * A tiny auxiliary class that represents a document within its DocSet.
 */
class DocumentSlot {
    constructor(docSet, docId) {
        this.docSet = docSet;
        this.docId = docId;
    }

    get() {
        return this.docSet.getDoc(this.docId);
    }

    set(doc) {
        this.docSet.setDoc(this.docId, doc);
    }

    create() {
        var doc = automerge.init();
        this.set(doc);
        return doc;
    }

    registerHandler(callback) {
        var h;
        this.docSet.registerHandler(h = (docId, doc) => {
            if (docId === this.docId) callback(doc);
        });
        callback._sloth = h; // for unregister
    }

    unregisterHandler(callback) {
        if (callback._sloth)
            this.docSet.unregisterHandler(callback._sloth);
    }
}

/**
 * A tiny auxiliary class that represents an object contained in a document.
 */
class DocumentPathSlot {
    constructor(docSlot, path=[]) {
        this.docSlot = docSlot;
        this.path = path;
    }
    
    get() {
        return this.getFrom(this.docSlot.get());
    }

    getFrom(doc) {
        return this._getPath(doc, this.path);
    }

    set(value) {
        var doc = this.docSlot.get(),
            newDoc = automerge.change(doc, doc => {
                var parent = this._getPath(doc, this.path.slice(0, -1));
                parent[this.path.slice(-1)[0]] = value;
            });
        // only set if changed, to avoid re-triggering
        if (newDoc !== doc)
            this.docSlot.set(newDoc);
    }

    change(func) {
        var doc = this.docSlot.get(),
            newDoc = automerge.change(doc, doc => func(this.getFrom(doc)));
        // only set if changed, to avoid re-triggering
        if (newDoc !== doc)
            this.docSlot.set(newDoc);  
    }

    _getPath(obj, path) {
        for (let prop of path) {
            if (obj === undefined) break;
            obj = obj[prop];
        }
        return obj;
    }
}

/**
 * A tiny auxiliary class that represents an object contained in a document
 * referenced via its object identifier.
 */
class DocumentObjectSlot {
    constructor(docSlot, objectId) {
        this.docSlot = docSlot;
        this.objectId = objectId;
    }

    get() {
        return this.getFrom(this.docSlot.get());
    }

    getFrom(doc) {
        return automerge.getObjectById(doc, this.objectId);
    }

    set(value) {
        throw new Error('cannot set object by identifier only');
    }

    change(func) {
        var doc = this.docSlot.get(),
            newDoc = automerge.change(doc, doc => func(this.getFrom(doc)));
        // only set if changed, to avoid re-triggering
        if (newDoc !== doc)
            this.docSlot.set(newDoc);  
    }
}


/* The part that follows is based on automerge-codemirror.
 * (TODO send upstream)
 * https://github.com/aslakhellesoy/automerge-codemirror
 */

function updateAutomergeDoc(
  slot,
  codeMirrorDoc,
  editorChange
) {
  if (editorChange.origin === 'automerge') return;  // own change

  slot.change(text => {
    const startPos = codeMirrorDoc.indexFromPos(editorChange.from)

    const removedLines = editorChange.removed || []
    const addedLines = editorChange.text

    const removedLength =
      removedLines.reduce((sum, remove) => sum + remove.length + 1, 0) - 1
    if (removedLength > 0) {
      text.splice(startPos, removedLength)
    }

    const addedText = addedLines.join('\n')
    if (addedText.length > 0) {
      text.splice(startPos, 0, ...addedText.split(''))
    }
  })
}

/**
 * A variant of Automerge.diff, skipping changes made by self.
 * Used by updateCodeMirrorDocs to avoid one's own changes re-applied to the
 * same CodeMirror instance.
 */
function diffForeign(oldDoc, newDoc, self) {
  const {Frontend, Backend} = automerge;
  const oldState = Frontend.getBackendState(oldDoc)
  const newState = Frontend.getBackendState(newDoc)
  const changes = Backend.getChanges(oldState, newState).filter(c => c.actor !== self);
  const [state, patch] = Backend.applyChanges(oldState, changes)
  return patch.diffs
}


function updateCodeMirrorDocs(
    oldDoc,
    newDoc,
    objectId,
    self,
    codeMirrorDoc
) {
  if (!oldDoc) return;

  const diffs = diffForeign(oldDoc, newDoc, self)

  for (const d of diffs) {
    if (!(d.type === 'text' && d.obj === objectId)) continue

    switch (d.action) {
      case 'insert': {
        const fromPos = codeMirrorDoc.posFromIndex(d.index)
        codeMirrorDoc.replaceRange(d.value, fromPos, undefined, 'automerge')
        break
      }
      case 'remove': {
        const fromPos = codeMirrorDoc.posFromIndex(d.index)
        const toPos = codeMirrorDoc.posFromIndex(d.index + 1)
        codeMirrorDoc.replaceRange('', fromPos, toPos, 'automerge')
        break
      }
    }
  }
}

  

module.exports = {SyncPad, DocumentSlot, DocumentPathSlot, DocumentObjectSlot};
