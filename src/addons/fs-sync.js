const node_require = global.require || (() => {}), /* bypass browserify */

      fs = node_require('fs'), path = node_require('path'),
      globAll = node_require('glob-all');



/**
 * Synchronizes a document with files residing in a local directory.
 * Synchronization is one-way: incoming changes to the document are written
 * to files. Local changes made to the files are ignored, and overwritten
 * the next time the document is syncronized.
 * The common use case would be writing content to a temporary folder, where
 * files can be compiled or otherwise processed by the client app.
 * 
 * Naturally, DirectorySync does not work in a browser. It requires a Node.js
 * environment with `fs`. (NWjs is also good.)
 */
class DirectorySync {
    /** 
     * The constructor accepts a document slot that refers to a list of objects
     * of the form `{filename, content}`.
     * `filename` should be a string and may contain `/`-separated path elements.
     *   Subdirectories are created as needed.
     * `content` is typically an Automerge.Text that is stored as a UTF8-encoded
     *   string. If it is a regular object, it is stored as JSON.
     * 
     * @param slot a `DocumentObjectSlot`-like object (should at least support
     *   `get()`)
     */
    constructor(slot, dir) {
        this.slot = slot;
        this.dir = dir;
    }

    populate(files) {
        var pats = files ? (typeof files === 'string' ? [files] : files) : ['**'],
            found = globAll.sync(global.Array.from(pats), {cwd: this.dir})
                    .map(relfn => ({fn: path.join(this.dir, relfn), relfn}));

        const setContent = (obj, a) => {
            obj.content = new automerge.Text();
            obj.content.insertAt(0, ...Array.from(a));
        };

        this.slot.get() || this.slot.set([]);
        this.slot.change(fileEntries => {
            for (let {fn, relfn} of found) {
                let index = fileEntries.push({filename: relfn}) - 1,
                    text = fs.readFileSync(fn, 'utf-8');
                setContent(fileEntries[index], text);
            }
        });
    }

    save() {
        var files = this.slot.get();

        for (let {filename, content} of files) {
            try {
                this._writeFile(filename, 
                    (content instanceof automerge.Text) ? content.join('')
                        : JSON.stringify(content));
            }
            catch (e) {
                console.error(`DirectorySync: write of '${filename}' failed;`, e);
            }
        }
    }

    _writeFile(filename, content) {
        var fp = this.indir(filename);
        fs.mkdirSync(path.dirname(fp), {recursive: true});
        fs.writeFileSync(fp, content);
    }

    indir(p) {
        p = p.replace(/^[/]+/, '');
        return path.join(this.dir, p);
    }
}



module.exports = {DirectorySync};
