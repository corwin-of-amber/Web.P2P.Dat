
const automerge = require('automerge'),
      automergeCodeMirror = require('automerge-codemirror'),
      makeCodeMirrorChangeHandler = require('automerge-codemirror/dist/src/makeCodeMirrorChangeHandler').default;



class SyncPad {
    constructor(cm, docSet, id='syncpad') {
        this.cm = cm;
        this.docSet = docSet;

        var doc = this.docSet.getDoc(id) || this.newDoc();
        this.docSet.setDoc(id, doc);

        cm.setValue(doc.text.join(''));

        this.watch = new automergeCodeMirror.DocSetWatchableDoc(this.docSet, id);
        this.mutex = new automergeCodeMirror.Mutex();
        this.link = {codeMirror: this.cm, getText: d => d.text};

        // Synchronize CodeMirror -> Automerge
        this.handler = makeCodeMirrorChangeHandler(
            this.watch, this.link.getText, this.mutex
        );

        cm.on('change', this.handler);

        // Synchronize Automerge -> CodeMirror
        const links = new Set([this.link]);

        this.watch.registerHandler(newDoc => {
            doc = automergeCodeMirror.updateCodeMirrorDocs(doc, newDoc, links, this.mutex)
        });
    }

    newDoc() {
        var doc = automerge.init();
        return automerge.change(doc, d => { d.text = new automerge.Text(); });
    }
}


module.exports = {SyncPad};
