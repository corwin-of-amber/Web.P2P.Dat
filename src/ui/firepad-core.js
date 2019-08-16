
const options = require('merge-options'),
      {EditorClient, EntityManager, RichTextCodeMirror, RichTextCodeMirrorAdapter,
       ServerAdapter, utils} = require('firepad-core');

// Firepad *can* work in Browserify, but requires CodeMirror to be available globally
if (typeof window !== 'undefined')
    window.CodeMirror = require('codemirror');



const DEFAULT_OPTIONS = {userId: 'null-user', userColor: '#9999FF'};


class FirepadCore extends EditorClient {

    constructor(editor, opts={}) {
        opts = options(opts, DEFAULT_OPTIONS);

        var serverAdapter = new TriggerAdapter(null, opts.userId, opts.userColor),
            editorAdapter = FirepadCore.createCodeMirrorAdapter(editor);

        super(serverAdapter, editorAdapter);
        serverAdapter.receiver = this;
    }

    static createCodeMirrorAdapter(cm) {
        var entityManager_ = new EntityManager();
        var richTextCodeMirror_ = new RichTextCodeMirror(cm, entityManager_,
                                                        { cssPrefix: 'firepad-' }),
            editorAdapter_ = new RichTextCodeMirrorAdapter(richTextCodeMirror_);

        return editorAdapter_;
    }

    data(msg) {
        if (msg.operation)
            this.serverAdapter.trigger('operation', msg.operation);
        if (msg.cursor)
            this.serverAdapter.trigger('cursor',
                msg.cursor.user, msg.cursor.at, msg.cursor.color);
    }
}

utils.makeEventEmitter(FirepadCore, ['data'].concat(
    EditorClient.prototype.allowedEvents_));


class TriggerAdapter extends ServerAdapter {

    constructor(receiver, userId, userColor) {
        super(userId, userColor);
        this.receiver = receiver;
    }

    sendOperation(operation, callback) {
        this.receiver.trigger('data', {operation});
        process.nextTick(() => {
            this.trigger('ack');
            if (callback) callback();
        });
    }

    sendCursor(at) {
        this.receiver.trigger('data', {cursor: 
            {at, user: this.userId_, color: this.userColor_}});
    }

}



module.exports = {FirepadCore}
