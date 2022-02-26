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

/**
 * `?doc2` --> {channel: 'doc2'}
 * `?channel=doc2&persist=true` --> {channel: 'doc2', persist: true}
 * `?doc2&persist=true` --> {channel: 'doc2', persist: true}
 */
function parseParams(sp = new URLSearchParams(window.location.search)) {
    var opts = {}, bools = [/* tbd */];
    for (let [k, v] of sp.entries()) {
        if (v === '' && !opts.channel)
            opts.channel = k;
        else if (k === 'c')
            opts.channel = v;
        else if (bools.includes(k))
            opts[k] == ['true', 'yes', 'on'].includes(v);
        else
            opts[k] = v;
    }
    return opts;
}

function main_syncdoc(opts = parseParams()) {
    var fcsd = opts.persist ? new FeedCrowdStorageDirectory(opts.persist) : null;

    var c1 = new DocumentClient(
        fcsd ? {storageFactory: fcsd.storageFactory} : {}
    );

    App.start({channel: opts.channel || 'doc2'}).attach(c1);

    const {DirectorySync} = require('./src/addons/fs-sync');

    if (DirectorySync.hasNodeFS()) {
        var ds = new DirectorySync(c1.sync.path('d1', ['source']), '/tmp/dirsync');
        c1.on('shout', () => ds.save());
        Object.assign(window, {ds});
    }

    window.addEventListener('beforeunload', () => {
        c1.close();
        window.c1 = window.createDocument = window.fcsd = null;
    });
    Object.assign(window, {c1, fcsd});
}

function main_syncdoc_headless(opts) {
    var c1 = new DocumentClient();
    c1.join(opts.channel || 'doc2');

    c1.on('change', console.log);
}


async function main_syncpad(opts) {
    var c1 = new DocumentClient();

    var app = App.start({channel: opts.channel || 'doc2'}).attach(c1);

    await c1.init();

    app.vue.$on('open', (ev) => {
        app.vue.$refs.pad.slot = ev.slot;
    });

    window.addEventListener('beforeunload', () => {
        c1.close();
    });
    Object.assign(window, {c1});
}

function main() {
    var sp = new URLSearchParams(window.location.search),
        opts = parseParams(sp);
    if (sp.has('chat'))  main_chat();  /* defunct */
    else                 main_syncdoc(opts);
}

function main_headless() {
    // at least I manage to amuse myself
    var sp = new URLSearchParams(process.argv.slice(2).join('&')),
        opts = parseParams(sp);
    if (sp.has('chat'))  main_chat_headless();
    else                 main_syncdoc_headless(opts);
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
