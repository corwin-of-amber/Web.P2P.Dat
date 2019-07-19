
const _ = require('lodash'),
      automerge = require('automerge');



class SyncPad {

    constructor(cm, docSet, opts={}) {
        this.cm = cm;
        this.docSet = docSet;

        var docId = opts.docId || 'syncpad',
            debounce = {wait: (opts.debounce && opts.debounce.wait) || 50,
                        max: (opts.debounce && opts.debounce.max) || 500};

        var doc = this.docSet.getDoc(docId) || this.newDoc();
        this.docSet.setDoc(docId, doc);

        cm.setValue(doc.text.join(''));

        this.slot = new DocumentPathSlot(new DocumentSlot(docSet, docId), ['text']);
        this._objectId = automerge.getObjectId(this.slot.get());
        this._actorId = automerge.getActorId(doc);

        // Synchronize CodeMirror -> Automerge
        this.cmHandler = (cm, change) => {
            updateAutomergeDoc(this.slot, cm.getDoc(), change);
        };

        cm.on('change', this.cmHandler);

        // Synchronize Automerge -> CodeMirror
        this.amHandler = _.debounce(newDoc => {
            doc = updateCodeMirrorDocs(doc, newDoc, this._objectId, this._actorId, cm.getDoc());
        }, debounce.wait, {maxWait: debounce.max});

        this.slot.docSlot.registerHandler(this.amHandler);
    }

    newDoc() {
        var doc = automerge.init();
        return automerge.change(doc, d => { d.text = new automerge.Text(); });
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

    registerHandler(callback) {
        this.docSet.registerHandler((docId, doc) => {
            if (docId === this.docId) callback(doc);
        });
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
        for (let prop of this.path) {
            if (!doc) break;
            doc = doc[prop];
        }
        return doc;
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
  if (!oldDoc) {
    return newDoc
  }

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

  return newDoc
}

function findLink(newDoc, links, op) {
  for (const link of links) {
    const text = link.getText(newDoc)
    const textObjectId = automerge.getObjectId(text)
    if (op.obj === textObjectId) {
      return link
    }
  }
  return null
}
  


module.exports = {SyncPad};
