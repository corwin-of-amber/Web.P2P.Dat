import * as automerge from 'automerge';
import CodeMirror from 'codemirror';
import _ from 'lodash';

import {DocumentSlotInterface} from 'automerge-slots';


/**
 * A synchronized editor that supports multi-client editing.
 * Uses Automerge.Text for synchronization.
 */
class AutomergeCodeMirror<D> {

  cm: CodeMirror.Editor;
  slot: DocumentSlotInterface<D, automerge.Text>;

  lastRev?: automerge.Doc<D>;

  _objectId?: automerge.UUID;
  _park?: () => void;

  cmHandler?: (cm: CodeMirror.Editor, change: CodeMirror.EditorChange) => void;
  amHandler?: ((newRev: automerge.Doc<D>) => void) & _.Cancelable;

  /**
   * Constructs a live link between a CodeMirror instance and a Text
   * embedded in an Automerge document.
   * @param {CodeMirror.Editor} cm the CodeMirror instance
   * @param {DocumentSlotInterface} slot the slot (DocumentPathSlot/DocumentObjectSlot)
   *   of the Automerge.Text to connect
   * @param {object} opts options object:
   *   debounce.wait - the debounce time for incoming Automerge changes
   *      (in ms, default 50)
   *   debounce.max - maxWait for said debounce, after which queued changes
   *      are flushed even if changes keep coming (in ms, default 500)
   */
  constructor(cm : CodeMirror.Editor, slot: DocumentSlotInterface<D, automerge.Text>, opts:Options={}) {
      this.cm = cm;
      this.slot = slot;

      this._park = () => {
          if (this.slot.get()) {
              this.slot.docSlot.unregisterHandler(this._park!);
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

      this.cmHandler = (cm : CodeMirror.Editor, change : CodeMirror.EditorChange) => {
          this.lastRev = updateAutomergeDoc(slot, cm.getDoc(), change)
                         || this.lastRev;
      };

      cm.on('change', this.cmHandler);
      cm.on('beforeChange', () => this.amHandler!.flush());

      // Synchronize Automerge -> CodeMirror
      this.lastRev = doc;

      this.amHandler = _.debounce((newRev: automerge.Doc<D>) => {
          updateCodeMirrorDocs(this.lastRev!, newRev, 
                               this._objectId, cm.getDoc());
          this.lastRev = newRev;
      }, debounce.wait, {maxWait: debounce.max});

      slot.docSlot.registerHandler(this.amHandler);
  }

  _debounceOpts(opts: Options) {
      return {wait: (opts.debounce && opts.debounce.wait) || 50,
              max:  (opts.debounce && opts.debounce.max)  || 500};
  }
}


type Options = { debounce?: { wait?: number; max?: number; }; };




/* The part that follows is based on automerge-codemirror.
 * (TODO send upstream)
 * https://github.com/aslakhellesoy/automerge-codemirror
 */

function updateAutomergeDoc<D>(
    slot : DocumentSlotInterface<D, automerge.Text>,
    codeMirrorDoc : CodeMirror.Doc,
    editorChange : CodeMirror.EditorChange
  ) : automerge.Doc<D> 
{
  if (editorChange.origin === 'automerge') return;  // own change

  return slot.change((text : automerge.Text) => {
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
  });
}


function updateCodeMirrorDocs<T>(
    oldDoc : automerge.Doc<T>,
    newDoc : automerge.Doc<T>,
    objectId: automerge.UUID,
    codeMirrorDoc: CodeMirror.Doc
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



export {AutomergeCodeMirror}