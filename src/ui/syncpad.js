
const _ = require('lodash'),
      automerge = require('automerge'),
      automergeCodeMirror = require('automerge-codemirror');



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

        this.watch = new automergeCodeMirror.DocSetWatchableDoc(this.docSet, docId);
        this.link = {codeMirror: this.cm, getText: d => d.text};
        this._actorId = automerge.getActorId(doc);

        // Synchronize CodeMirror -> Automerge
        this.cmHandler = (cm, change) => {
            updateAutomergeDocSet(this.docSet, docId, this.link.getText, cm, change);
        };

        cm.on('change', this.cmHandler);

        // Synchronize Automerge -> CodeMirror
        const links = new Set([this.link]);

        this.amHandler = _.debounce(newDoc => {
            doc = updateCodeMirrorDocs(doc, newDoc, links, this._actorId);
        }, debounce.wait, {maxWait: debounce.max});

        this.watch.registerHandler(this.amHandler);
    }

    newDoc() {
        var doc = automerge.init();
        return automerge.change(doc, d => { d.text = new automerge.Text(); });
    }
}


/* The part that follows is based on automerge-codemirror.
 * (TODO send upstream)
 * https://github.com/aslakhellesoy/automerge-codemirror
 */

function updateAutomergeDocSet(docSet, docId, getText, cm, change) {
  var doc = docSet.getDoc(docId),
      newDoc = updateAutomergeDoc(doc, getText, cm.getDoc(), change);
  if (newDoc !== doc)
    docSet.setDoc(docId, newDoc);  // only set if changed, to avoid re-triggering
}

function updateAutomergeDoc(
  doc,
  getText,
  codeMirrorDoc,
  editorChange
) {
  if (editorChange.origin === 'automerge') {
    return doc;
  }

  return automerge.change(doc, draft => {
    const text = getText(draft)
    if (!text) return
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
    links,
    self
) {
  if (!oldDoc) {
    return newDoc
  }

  const diffs = diffForeign(oldDoc, newDoc, self)

  for (const d of diffs) {
    if (d.type !== 'text') continue
    const link = findLink(newDoc, links, d)
    if (!link) continue
    const codeMirrorDoc = link.codeMirror.getDoc()

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
