import path from 'path';
import { FeedClient, LOCAL_OPTIONS } from './net/client';
import { DocumentClient } from './net/client-docs';
import { DocSyncStorageDirectory } from './net/docsync';



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
    var opts: any = {}, bools = [/* tbd */];
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


function main_syncdoc_headless(opts) {
    var c1 = new DocumentClient(opts.server === 'local' ? LOCAL_OPTIONS : undefined);
    c1.join(opts.channel || 'doc2');

    c1.on('change', console.log);

    if (opts.persist) {
        let dssd = new DocSyncStorageDirectory(path.join(opts.persist, 'docs'));
        dssd.restore(c1.sync);
        dssd.autosave(c1.sync);
    }
}



function main_headless() {
    // at least I manage to amuse myself
    var sp = new URLSearchParams(process.argv.slice(2).join('&')),
        opts = parseParams(sp);
    if (sp.has('chat'))  main_chat_headless();
    else                 main_syncdoc_headless(opts);
}


main_headless();
