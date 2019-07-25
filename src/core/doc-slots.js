
/**
 * Represents a document within its DocSet.
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

    path(path=[]) {
        return (path && path.length) ? new DocumentPathSlot(this, path) : this;
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
 * Represents an object contained in a document,
 * referenced by its path.
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
        var doc = this.docSlot.get(), newValue,
            newDoc = automerge.change(doc, doc => {
                var parent = this._getPath(doc, this.path.slice(0, -1)),
                    prop = this.path.slice(-1)[0];
                parent[prop] = value;
                newValue = parent[prop];
            });
        // only set if changed, to avoid re-triggering
        if (newDoc !== doc)
            this.docSlot.set(newDoc);
        return automerge.getObjectId(newValue);
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
 * Represents an object contained in a document,
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



module.exports = {DocumentSlot, DocumentPathSlot, DocumentObjectSlot};
