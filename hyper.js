const {Buffer} = require('buffer'),  // for Kremlin
      process = require('process');
if (typeof window !== 'undefined') {
    Object.assign(window, {Buffer, process});
}

const {FeedClient} = require('./src/net/client'),
      {FeedCrowdStorageDirectory} = require('./src/net/crowd'),
      {DocumentClient} = require('./src/net/client-docs'),
      {App} = require('./src/ui/ui');

import 'codemirror/lib/codemirror.css';
import './src/ui/app.css';



function main_chat() {
    var c1 = new FeedClient();
    var c2 = new FeedClient();

    var app = App.start().attach(c1);

    c1.create();

    c1.on('feed:append', ev => {
        app.vue.$refs.documents.docs.push(
            {from: ev.from, data: ev.data});
    });

    window.addEventListener('beforeunload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2});
}

function main_chat_headless(channel='lobby') {
    var c1 = new FeedClient();
    c1.join(channel);
    c1.on('feed:append', ev => {
        if (ev.data.message) console.log(ev.data.timestamp, ev.data.message);
        else                 console.log(ev.data);
    });
}


async function createDocument() {
    await c1.init();

    c1.sync.create('d1');
    c1.sync.change('d1', d => { d.name = "meg"; d.cards = []; });
}


function main_syncdoc(sp) {
    var fcsd = sp.has('persist') ? new FeedCrowdStorageDirectory(sp.get('persist')) : null;

    var c1 = new DocumentClient(
        fcsd ? {storageFactory: fcsd.storageFactory} : {}
    );

    window.fcsd = fcsd;

    App.start({channel: 'doc2'}).attach(c1);

    const {DirectorySync} = require('./src/addons/fs-sync');

    if (DirectorySync.hasNodeFS()) {
        var ds = new DirectorySync(c1.sync.path('d1', ['source']), '/tmp/dirsync');
        c1.on('shout', () => ds.save());
        Object.assign(window, {ds});
    }

    window.addEventListener('beforeunload', () => {
        c1.close();
        window.c1 = window.createDocument = window.ds = null;
    });
    Object.assign(window, {c1, createDocument});
}

function main_syncdoc_headless() {
    var c1 = new DocumentClient();
    c1.join('doc2');

    c1.on('change', console.log);
}


async function createText() {
    var slot = app.vue.$refs.pad.slot;
    slot.set(syncpad.FirepadShare.fromText('a'));

    //slot = app.vue.$refs.otherPad.slot;  // create a fork
    //c1.sync.docs.setDoc('d2', automerge.merge(automerge.init(), c1.sync.docs.getDoc('d1')));

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

    var app = App.start({channel: 'doc2'}).attach(c1);

    await c1.init();

    var ds = c1.sync;

    app.vue.$on('open', (ev) => {
        app.vue.$refs.pad.slot = ev.slot;
    });

    /*
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
    */
    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1, createText});

    //createText();
}

function main() {
    var sp = new URLSearchParams(window.location.search);
    if (sp.has('chat'))  main_chat();
    else                 main_syncdoc(sp);
}

function main_headless() {
    // at least I manage to amuse myself
    var sp = new URLSearchParams(process.argv.slice(2).join('&'));
    if (sp.has('chat'))  main_chat_headless();
    else                 main_syncdoc_headless();
}


if (typeof process !== 'undefined' && process.versions && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    const automerge = require('automerge'),
          video = require('./src/addons/video'),
          screen = require('./src/addons/share-screen'),
          fssync = require('./src/addons/fs-sync'),
          syncpad = require('./src/addons/syncpad'),
          firepad = require('firepad-core');
    Object.assign(window, {automerge, video, screen, fssync, syncpad, firepad});

    Object.assign(window, require('./tests/monkey')); // for testing

    Object.assign(window, {main, main_chat, main_syncdoc, main_syncpad});

    window.addEventListener('beforeunload', () => {
        window.automerge = window.video = window.screen = window.syncpad = window.fssync = window.firepad =
        window.main_chat = window.main_syncdoc =  window.main_syncpad = null;
        Date.prototype.com$cognitect$transit$equals =
        Date.prototype.com$cognitect$transit$hashCode = null;
        document.body.innerHTML = "";
    });
}
else 
    main_headless();  // listen only
