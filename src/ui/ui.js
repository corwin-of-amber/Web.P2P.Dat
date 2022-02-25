import Vue from 'vue/dist/vue';
import moment from 'moment';

import * as bidiText from './bidi-text';

import 'vue-context/dist/css/vue-context.css';
import './menu.css';

import EventHook from './components/event-hook.vue';
import PlainList from './components/plain-list.vue';
import ListOfPeers from './components/list-of-peers.vue';
import ButtonJoin from './components/button-join.vue';
import DocumentsRaw from './components/treedoc/documents-raw.vue';
import syncpad from './components/syncpad/syncpad.vue';
import ListOfDocuments from './components/syncpad/list-of-documents.vue';


Vue.component('p2p.source-peers', {
    data: () => ({ self: undefined, peers: [] }),
    template: `<span></span>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        updatePeers(client) {
            this.self = client;
            this.peers.splice(0, Infinity, ...client.getPeers());
        },
        register(client) {
            client.deferred.init.then(() => {
                var cb = () => this.updatePeers(client);
                client.on('peer:join', cb);
                client.on('peer:leave', cb);
                cb();
                this._registered = {client, cb};
            })
        },
        unregister() {
            if (this._registered) {
                var {client, cb} = this._registered;
                client.removeListener('peer:join', cb);
                client.removeListener('peer:leave', cb);
            }
        }
    }
});


Vue.component('p2p.source-messages', {
    data: () => ({ messages: [], messagesSorted: [] }),
    template: `<span/>`,
    watch: {
        messages() {
            var sl = this.messages.concat()
                         .sort((x,y) => x.timestamp - y.timestamp);
            this.messagesSorted.splice(0, Infinity, ...sl);
        }
    },
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        register(client) {
            var cb = ev => { this.messages.push(ev.data); };
            client.on('feed:append', cb);
            this._registered = {client, cb};
        },
        unregister() {
            if (this._registered) {
                var {client, cb} = this._registered;
                client.removeListener('feed:append', cb);
            }
        }
    }
});

Vue.component('p2p.list-of-messages', {
    data: () => ({ messages: [] }),
    template: `
        <div>
            <p2p.source-messages ref="source"/>
            <p v-if="messages.length == 0">(Welcome)</p>
            <plain-list :items="messages" v-slot="{item}">
                <template v-if="typeof item === 'object'">
                    <message :message="item" v-if="item.message"/>
                    <record-object :object="item" v-else/>
                </template>
                <template v-else>{{item}}</template>
            </plain-list>
        </div>
    `,
    mounted() {
        this.messages = this.$refs.source.messagesSorted;
    },
    components: {
        PlainList,
        'message': {
            props: ['message'],
            template: `
                <div>
                    <span class="time" v-if="message.timestamp">{{time}}</span>
                    <span class="message" :dir="dir">{{message.message}}</span>
                </div>
            `,
            computed: {
                time() {
                    return moment(this.message.timestamp).format('HH:mm');
                },
                dir() {
                    return bidiText.detectTextDir(this.message.message || '');
                }
            }
        }
    }
});

const {keyHex, keyHexShort} = require('../net/crowd');

Vue.component('p2p.source-feeds', {
    data: () => ({ remote: [], stats: {} }),
    template: `
        <span>
            <template v-for="feed in remote">
                <hook :receiver="feed" on="download" @download="onDownload(feed)"/>
            </template>
        </span>
    `,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        register(client) {
            this.remote = client.crowd.remoteFeeds;
        },
        unregister() {
        },
        onDownload(feed) {
            var stats = feed.stats;
            Vue.set(this.stats, keyHex(feed), stats);
        }
    },
    components: {
        hook: EventHook
    }
});

Vue.component('p2p.list-of-feeds', {
    data: () => ({ feeds: [], stats: {} }),
    template: `
        <div class="p2p-list-of-feeds">
            <p2p.source-feeds ref="source"/>
            <plain-list :items="feeds" v-slot="{item}">
                <span>{{keyHexShort(item)}} 
                    <dl-progress :value="downloadProgress(item, stats[keyHex(item)])"/></span>
            </plain-list>
        </div>
    `,
    mounted() {
        this.$refs.source.$watch('remote', (remote) => {
            this.feeds = remote;
        }, {immediate: true});
        this.stats = this.$refs.source.stats;
    },
    methods: {
        keyHex(feed) { return keyHex(feed); },
        keyHexShort(feed) { return keyHexShort(feed); },
        downloadProgress(feed, stats) {
            return stats && {total: feed.length,
                downloaded: stats.totals.downloadedBlocks,
                bytes: stats.totals.downloadedBytes
            };
        }
    },
    components: {
        PlainList,
        'dl-progress': {
            props: ["value"],
            template: `
                <span>
                    <template v-if="value">
                        {{value.downloaded}}/{{value.total}} ({{value.bytes}})
                    </template>
                </span>
            `
        }
    }
});


Vue.component('p2p.message-input-box', {
    data: () => ({ message: '' }),
    template: `
        <form action="#" @submit="send">
            <input v-model="message">
            <input type="submit" value="Send">
        </form>
    `,
    computed: {
        _client() { return this.$root.clientState && 
                           this.$root.clientState.client; }
    },
    methods: {
        async send(ev) {
            if (ev) ev.preventDefault();

            if (!this.message.match(/^\s*$/)) {
                var msg = {timestamp: Date.now(), message: this.message};

                var c = this._client;
                if (c) {
                    if (!c.feed) await c.create();
                    c.feed.append(msg);
                    c.feed.once('append', () => this.message = '');
                }
            }
        }
    }
});




Vue.component('p2p.document-context-menu', );


const {VideoIncoming} = require('../addons/video');

Vue.component('p2p.source-video', {
    props: ['videoincoming'],
    data: () => ({ streams: [], activePeers: [] }),
    template: `
        <span>
            <p2p.source-peers ref="source"/>
            <hook v-for="peer in activePeers" :key="peer.id"
                :receiver="peer.peer" on="stream" @stream="refresh"/>
        </span>
    `,
    mounted() {
        this.$watch('_streams', v => this._set(v || []), {immediate: true});
        this.activePeers = this.$refs.source.peers;
    },
    computed: {
        _streams() {
            if (this.videoincoming) {
                var client = this.$refs.source.self;
                return client && this.videoincoming.receive(client);
            }
        }
    },
    methods: {
        _set(streams) { this.streams.splice(0, Infinity, ...streams); },
        refresh() { this.$forceUpdate(); }
    },
    components: {
        hook: EventHook
    }
});


Vue.component('video-widget', {
    data: () => ({ streams: [] }),
    template: `
        <div class="video-widget">
            <template v-for="stream in streams">
                <video-stream-view :stream="stream"/>
            </template>
        </div>
    `,
    components: {
        'video-stream-view': {
            props: ['stream'],
            template: `
                <div> -- {{stream}} --</div>
            `,
            mounted() {
                this.$watch('stream', (stream) => {
                    this.$el.innerHTML = '';
                    if (stream instanceof MediaStream) {
                        this.$el.append(VideoIncoming.createVideoElement(stream));
                    }
                }, {immediate: true});
            }
        }
    }

});

Vue.component('p2p.video-view', {
    props: ['videoincoming'],
    template: `
        <div class="p2p-video-view">
            <p2p.source-video ref="source" :videoincoming="videoincoming"/>
            <video-widget ref="view"/>
        </div>
    `,
    mounted() {
        this.$refs.view.streams = this.$refs.source.streams;
    }
});


const {FileShare} = require('../addons/fs-sync');

Vue.component('p2p.file-object', {
    data: () => ({ fileshare: undefined }),
    template: `<span></span>`,
    mounted() {
        this.$watch('fileshare', async fileshare => {
            var client = this.$root.clientState.client;
            if (client && client.crowd) {
                this.$el.innerHTML = '';
                this.$el.append(await fileshare.receive(client.crowd));
            }
        })
    }
});
/*
const {SyncPad, FirepadShare} = require('../addons/syncpad');

Vue.component('syncpad', {
    data: () => ({ slot: undefined }),
    template: `<codemirror ref="editor"/>`,
    mounted() {
        this.$watch('slot', slot => {
            if (this.pad) this.pad.destroy();
            this.pad = new SyncPad(this.$refs.editor.cm, slot);
        });
    }
});*/

// - obsolete; superseded by `syncpad`
/*
Vue.component('automerge-codemirror', {
    data: () => ({ slot: undefined }),
    template: `<codemirror ref="editor"/>`,
    mounted() {
        this.$watch('slot', slot => {
            const {AutomergeCodeMirror} = require('automerge-codemirror');
            if (this.pad) this.pad.destroy();
            this.pad = new AutomergeCodeMirror(this.$refs.editor.cm, slot, {debounce: {wait: 0}});
        });
    }
});
*/

Vue.component('drawer', {
    data: () => ({ open: false }),
    template: `
        <div class="drawer" :class="open ? 'open' : 'closed'">
            <button @click="toggle()" class="toggle">×</button>
            <slot/>
        </div>`,
    methods: {
        toggle() { this.open = !this.open; }
    }
});

Vue.component('document-preview', {
    data: () => ({ kind: '', object: undefined }),
    template: `
        <div>
            <component :is="kind" ref="object"></component>
        </div>
    `,
    methods: {
        showText(slot, kind) {
            switch (kind) {
                case 'object/FirepadShare': this.kind = 'syncpad'; break;
                //case 'text/automerge': this.kind = 'automerge-codemirror'; break;
                default:
                    throw new Error(`unknown text document, kind '${kind}'`);
            }
            process.nextTick(() => this.$refs.object.slot = slot);
        },
        showFile(fileshare) {
            this.kind = 'p2p.file-object';
            process.nextTick(() => this.$refs.object.fileshare = fileshare);
        },
        showObject(vm, slot) {
            switch (vm.kind) {
                case 'object/FirepadShare':
                //case 'text/automerge':
                //    this.showText(slot, vm.kind);  return true;
                case 'file':
                    this.showFile(vm.coerced());   return true;
            }
            return false;
        }        
    }
});

Vue.component('preview-pane', {
    template: `
        <drawer ref="drawer">
            <document-preview ref="preview"></document-preview>
        </drawer>
    `,
    methods: {
        select(ev) {
            var client = this.$root.clientState.client;
            if (client && client.sync) {
                var slot = client.sync.object(ev.docId, ev.target.object);
                this.zoomObject(ev.target, slot);
            }
        },

        showObject(vm, slot) {
            if (this.$refs.preview.showObject(vm, slot))
                this.$refs.drawer.open = true;
        },

        zoomObject(vm, slot) {
            this.showObject(vm, slot);
            if (this.watch) this.watch.destroy();
            this.watch = new Watch(vm, 'object', () => this.showObject(vm, slot));
        }
    }
});


class Watch {
    constructor(vue, prop, handler) {
        this._registered = {unwatch: vue.$watch(prop, handler)};
    }
    destroy() {
        this._registered.unwatch();
    }
}


class App {
    constructor(dom, opts={}) {
        this.vue = new Vue({
            el: dom,
            data: {clientState: undefined},
            props: ['channel'],
            propsData: {channel: opts.channel ?? 'lobby'},
            computed: {
                ready() { return this.clientState && this.$refs.join.ready; }
            },
            components: { ButtonJoin, ListOfPeers, DocumentsRaw,
                syncpad, ListOfDocuments }
        });
        this.vue.$on('doc:action', ev => {
            switch (ev.type) {
            case 'select':
                this.vue.$refs.preview.select(ev); break;
            }
        });
    }
    attach(client) {
        this.vue.client = client;  // non-reactive
        var update = () =>
            this.vue.clientState = { 
                get client() { return client; }
            };
        update(); client.on('init', update);
        return this;
    }
}

App.start = function (opts={}) {
    window.app = new App(opts.root || document.querySelector('#app'), opts);
    window.addEventListener('beforeunload', () => { window.app = null; });
    return window.app;
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}