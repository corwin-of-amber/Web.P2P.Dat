const {FeedClient, DocumentClient} = require('./src/net/client'),
      {App} = require('./src/ui/ui');



function main_chat() {
    var c1 = new FeedClient();
    var c2 = new FeedClient();

    App.start().attach(c1);

    c1.create();

    window.addEventListener('beforeunload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2});
}

function main_chat_headless(channel='lobby') {
    var c1 = new FeedClient();
    c1.join(channel);
    c1.on('append', ev => {
        if (ev.data.message) console.log(ev.data.timestamp, ev.data.message);
        else                 console.log(ev.data);
    });
}


async function createDocument() {
    await c1.init();

    c1.sync.create('d1');
    c1.sync.change('d1', d => { d.name = "meg"; d.cards = []; });
}


function main_syncdoc() {
    var c1 = new DocumentClient();

    App.start().attach(c1);

    const {DirectorySync} = require('./src/addons/fs-sync');

    if (DirectorySync.hasNodeFS()) {
        var ds = new DirectorySync(c1.sync.path('d1', ['source']), '/tmp/dirsync');
        c1.on('shout', () => ds.save());
        Object.assign(window, {ds});
    }

    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1, createDocument});
}


async function createText() {
    var slot = app.vue.$refs.pad.slot;
    slot.get() || slot.set({operations: ['[{"o":["a"]}]'], cursors: {}});

    //slot = app.vue.$refs.otherPad.slot;  // create a fork
    c1.sync.docs.setDoc('d2', automerge.merge(automerge.init(), c1.sync.docs.getDoc('d1')));

    var ds = c1.sync.docs;

    function sync12() {
        ds.setDoc('d1', automerge.merge(ds.getDoc('d1'), ds.getDoc('d2')));
    }

    function sync21() {
        ds.setDoc('d2', automerge.merge(ds.getDoc('d2'), ds.getDoc('d1')));
    }

    Object.assign(window, {sync12, sync21});
}


async function main_syncpad() {
    var c1 = new DocumentClient();

    var app = App.start().attach(c1);

    await c1.init();

    var slot1 = c1.sync.path('d1', ['firepad']);
    app.vue.$refs.pad.slot = slot1;
    var slot2 = c1.sync.path('d2', ['firepad']);
    app.vue.$refs.otherPad.slot = slot1;

    process.nextTick(() => {
        var pad1 = app.vue.$refs.pad.pad, pad2 = app.vue.$refs.otherPad.pad;
        pad1.firepad.setUserId('pad1');
        pad2.firepad.setUserId('pad2');
        Object.assign(window, {pad1, pad2});
    });

    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1, createText});

    //createText();
}



if (typeof process !== 'undefined' && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    const automerge = require('automerge'),
          video = require('./src/addons/video'),
          screen = require('./src/addons/share-screen'),
          fssync = require('./src/addons/fs-sync'),
          syncpad = require('./src/ui/syncpad'),
          firepad = require('firepad-core');
    Object.assign(window, {automerge, video, screen, fssync, syncpad,  firepad});

    Object.assign(window, require('./tests/monkey')); // for testing

    Object.assign(window, {main_chat, main_syncdoc, main_syncpad});
}
else 
    main_chat_headless();  // listen only
