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

    async populate(files) {
        var pats = files ? (typeof files === 'string' ? [files] : files) : ['**'],
            found = globAll.sync(global.Array.from(pats), {cwd: this.dir});

        const munch = require('../core/munch');

        this.slot.get() || this.slot.set([]);
        for (let relfn of found) {
            await stream_pipeline(
                this._openFile(relfn),
                munch(128),
                this._createContentWriteStream(relfn));
        }
    }

    replicate(newDir) {
        var clone = new DirectorySync(this.slot, newDir);
        clone.save();
        return clone;
    }

    save() {
        var files = this.slot.get();

        for (let {filename, content} of files) {
            try {
               this._writeFile(filename,
                    (typeof content === 'string') ? content :
                    (this._isFirepad(content))    ? this._getTextContent(content) :
                                                    JSON.stringify(content));
            }
            catch (e) {
                console.error(`DirectorySync: write of '${filename}' failed;`, e);
            }
        }
    }

    _openFile(filename) {
        return fs.createReadStream(this.indir(filename), {encoding: 'utf-8'});
    }

    _writeFile(filename, content) {
        var fp = this.indir(filename);
        fs.mkdirSync(path.dirname(fp), {recursive: true});
        fs.writeFileSync(fp, content);
    }

    _getTextContent(content) {
        const {FirepadShare} = require('../ui/syncpad');
        return FirepadShare.from(content).getValue();
    }

    _isFirepad(content) {
        return content && typeof content === 'object'
                       && content.$type === 'FirepadShare';
    }

    _createContentWriteStream(filename) {
        return this._createSyncPad(filename).createWriteStream();
    }

    _createSyncPad(filename) {
        const {SyncPad} = require('../ui/syncpad'),
              CodeMirror = require('codemirror');  // oops
    
        var slot = this._createFirepadShare(filename);
        return new SyncPad(new CodeMirror(), slot);    
    }

    _createFirepadShare(filename) {
        const {FirepadShare} = require('../ui/syncpad');

        var slot = this._createFileEntry(filename), subslot;
        slot.change(obj => {
            obj.content = new FirepadShare();
            subslot = slot.object(obj.content);
        });
        return subslot;
    }

    _createFileEntry(filename) {
        var subslot;
        this.slot.change(fileEntries => {
            var index = fileEntries.findIndex(e => e.filename == filename);
            if (index < 0) index = fileEntries.push({filename}) - 1;
            var obj = fileEntries[index];   // must access through index to modify
            subslot = this.slot.object(obj);
        });
        return subslot;
    }

    indir(p) {
        p = p.replace(/^[/]+/, '');
        return path.join(this.dir, p);
    }

    static hasNodeFS() { return !!fs; }
}


const through2 = require('through2'), streamToBlob = require('stream-to-blob'),
      mergeOptions = require('merge-options'),
      {keyHex} = require('../net/crowd'),
      {FileWatcher} = require('../core/file-watcher');

const DEFAULT_FILE_METADATA = {type: 'fileshare',
                               mimeType: 'application/octet-stream'};

class FileSync {

    constructor(slot, filename, metadata) {
        this.slot = slot;
        this.filename = filename;
        this.metadata = metadata;
        this.share = undefined;
    }

    async update(crowd=this._crowd) {
        if (!crowd) throw new Error('no FeedCrowd given');
        this.share = await (this.share ? this.share.recreate(crowd, this.filename)
                                       : FileShare.create(crowd, this.filename, this.metadata));
        this._crowd = crowd;
        this.slot.set(this.share);
        return this;
    }

    watch() {
        if (this._watcher) this._watcher.clear();

        this._watcher = new FileWatcher().single(this.filename)
            .on('change', () => this.update());
        return this;
    }

    unwatch() {
        if (this._watcher) this._watcher.clear();
        this._watcher = undefined;
    }
}

/**
 * Initializes a shared file entry. This object can be embedded in a JSON
 * document (e.g. with Automerge) and recreated with FileShare.from.
 * 
 * Typically, a new FileShare instance is created with FileShare.create.
 */
class FileShare {
    /**
     * (private consturctor)
     * @param {string|Buffer|Uint8Array} feedKey key of containing feed
     * @param {object} blocks range of blocks in the form {start, end}
     */
    constructor(feedKey, blocks={start: 0, end: -1}) {
        this.$type = 'FileShare';
        this.feedKey = feedKey;
        this.blocks = blocks;
    }

    static from(props) {
        if (props.$type && props.$type !== 'FileShare')
            console.warn(`expected a FileShare, got $type = ${props.$type}`);
        return new FileShare(props.feedKey, props.blocks);
    }

    /**
     * Creates a new feed and a file share entry from a file.
     * @param {FeedCrowd} crowd the feed container to create the feed in
     * @param {string|ReadStream} file_or_stream content
     * @param {object} metadata new feed metadata
     * @returns {FileShare} the new version entry
     */
    static async create(crowd, file_or_stream, metadata) {
        metadata = mergeOptions(DEFAULT_FILE_METADATA, metadata);

        var feed = await crowd.create({valueEncoding: 'binary', sparse: true}, metadata);
        return await this.send(file_or_stream, feed);
    }

    async receive(crowd) {
        var blob = await this.receiveBlob(crowd);
        if (blob) {
            var object = document.createElement('object');
            object.type = blob.type;
            object.data = URL.createObjectURL(blob);
            return object;
        }
    }

    async receiveBlob(crowd) {
        var feed = await crowd.get(this.feedKey);
        return this.constructor.receiveBlob(feed, this.blocks);
    }

    /**
     * Creates a new FileShare using the same feed. Typically used to upload
     * a new version of the same file.
     * @param {FeedCrowd} crowd the feed container (that was used in create()).
     * @param {string|ReadStream} file_or_stream content
     * @returns {FileShare} the new version entry
     */
    async recreate(crowd, file_or_stream) {
        var feed = await crowd.get(this.feedKey);
        return this.constructor.send(file_or_stream, feed);
    }

    static async send(file_or_stream, feed) {
        var start = feed.length;
        await this.upload(file_or_stream, feed);
        return new FileShare(keyHex(feed), {start, end: feed.length});
    }

    static upload(file_or_stream, feed) {
        var instream = (typeof file_or_stream === 'string')
            ? fs.createReadStream(file_or_stream) : file_or_stream;
        var outstream = feed.createWriteStream();
        // If this is a stream of Node.js `Buffer`s, some light touchup is needed
        return stream_pipeline(instream, this._streamAdapter(), outstream);
    }

    static async receiveBlob(feed, blocks) {
        await this._updateFeed(feed);
        var instream = feed.createReadStream(blocks),
            mimeType = feed.meta && feed.meta.mimeType;
        return streamToBlob(instream, mimeType);
    }

    static _streamAdapter() {
        return through2((chunk, enc, cb) =>
            { chunk._isBuffer = true; cb(null, chunk); });
    }

    static _updateFeed(feed) {
        if (feed.writable) return Promise.resolve();
        return new Promise(resolve =>
            feed.update({ifAvailable: true}, resolve));
    }
}


/** stream.pipeline polyfill that also returns a Promise */
function stream_pipeline(...streams) {
    if (streams.length === 0) throw new Error('empty pipeline');
    return new Promise((resolve, reject) => {
        streams.reduce((inlet, outlet) => {
            inlet.on('error', reject);
            return inlet.pipe(outlet);
        }).on('error', reject).on('finish', resolve);
    });
}



module.exports = {DirectorySync, FileSync, FileShare};
