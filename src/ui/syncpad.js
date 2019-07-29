
const _ = require('lodash'),
      automerge = require('automerge');



/**
 * A synchronized editor that supports multi-client editing.
 * Uses Automerge.Text for synchronization.
 */
class SyncPad {
    /**
     * Constructs a live link between a CodeMirror instance and a Text
     * embedded in an Automerge document.
     * @param {*} cm the CodeMirror instance
     * @param {*} slot the slot (DocumentPathSlot/DocumentObjectSlot) of the
     *   Text to connect
     * @param {*} opts options object:
     *   debounce.wait - the debounce time for incoming Automerge changes
     *      (in ms, default 50)
     *   debounce.max - maxWait for said debounce, after which queued changes
     *      are flushed even if changes keep coming (in ms, default 500)
     */
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

        var debounce = this._debounceOpts(opts);

        var {cm, slot} = this;

        // Synchronize CodeMirror -> Automerge
        cm.setValue(slot.get().join(''));

        this.cmHandler = (cm, change) => {
            this.lastRev = updateAutomergeDoc(slot, cm.getDoc(), change)
                           || this.lastRev;
        };

        cm.on('change', this.cmHandler);
        cm.on('beforeChange', () => this.amHandler.flush());

        // Synchronize Automerge -> CodeMirror
        this.lastRev = doc;

        this.amHandler = _.debounce(newRev => {
            updateCodeMirrorDocs(this.lastRev, newRev, 
                                 this._objectId, cm.getDoc());
            this.lastRev = newRev;
        }, debounce.wait, {maxWait: debounce.max});

        slot.docSlot.registerHandler(this.amHandler);
    }

    _debounceOpts(opts) {
        return {wait: (opts.debounce && opts.debounce.wait) || 50,
                max:  (opts.debounce && opts.debounce.max)  || 500};
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

  return slot.change(text => {
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


function updateCodeMirrorDocs(
    oldDoc,
    newDoc,
    objectId,
    codeMirrorDoc
) {
  if (!oldDoc) return;

  const diffs = automerge.diff(oldDoc, newDoc)

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

  

module.exports = {SyncPad};
