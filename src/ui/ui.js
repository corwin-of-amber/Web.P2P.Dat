import assert from 'assert';
import Vue from 'vue/dist/vue';
import VueContext from 'vue-context';
import cuid from 'cuid';
import moment from 'moment';

import * as bidiText from './bidi-text';

import 'vue-context/dist/css/vue-context.css';
import './menu.css';



Vue.component('plain-list', {
    data: () => ({ items: [] }),
    template: `
        <ul class="plain-list">
            <li v-for="item in items">
                <slot v-bind:item="item">{{item.toString()}}</slot>
            </li>
        </ul>
    `
});


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

Vue.component('p2p.list-of-peers', {
    template: `
        <div>
            <p2p.source-peers ref="source"/>
            <plain-list ref="list" v-slot="{item}">
                {{item.id}}
            </plain-list>
        </div>
    `,
    mounted() {
        this.$refs.list.items = this.$refs.source.peers;
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
            <plain-list ref="list" v-slot="{item}">
                <template v-if="typeof item === 'object'">
                    <message :message="item" v-if="item.message"/>
                    <record-object :object="item" v-else/>
                </template>
                <template v-else>{{item}}</template>
            </plain-list>
        </div>
    `,
    mounted() {
        this.messages = this.$refs.list.items =
            this.$refs.source.messagesSorted;
    },
    components: {
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
        hook: eventHook()
    }
});

Vue.component('p2p.list-of-feeds', {
    data: () => ({ feeds: [], stats: {} }),
    template: `
        <div class="p2p-list-of-feeds">
            <p2p.source-feeds ref="source"/>
            <plain-list ref="list" v-slot="{item}">
                <span>{{keyHexShort(item)}} 
                    <dl-progress :value="downloadProgress(item, stats[keyHex(item)])"/></span>
            </plain-list>
        </div>
    `,
    mounted() {
        this.$refs.source.$watch('remote', (remote) => {
            this.feeds = this.$refs.list.items = remote;
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


Vue.component('p2p.button-join', {
    props: ['channel'],
    data: () => ({ status: undefined }),
    template: `
        <span class="p2p-button-join" :class="status">
            <p2p.source-status ref="source" :channel="channel"/>
            <button @click="onClick()" :disabled="disabled">
                <slot>Join</slot>
            </button>
            <label>{{status}}</label>
        </span>`,
    computed: {
        disabled() { return this.status != 'disconnected' || !this._client(); },
        ready() { return this.$refs.source && this.$refs.source.ready; }
    },
    mounted() {
        this.$refs.source.$watch('status', (status) => {
            this.status = status;
        }, {immediate: true});
    },
    methods: {
        _client() {
            return this.$refs.source && this.$refs.source._client;
        },
        onClick() {
            this.$refs.source.connect();
        }
    }
});


Vue.component('p2p.source-status', {
    props: {
        channel: String,
        updateInterval: {type: Number, default: 500},
        connectTimeout: {type: Number, default: 25000}
    },
    data: () => ({ pending: null, clientChannels: undefined, ready: false }),
    template: `<span></span>`,
    computed: {
        status() {
            if ((this.pending === 'connecting') === this.joined)  // sneaky
                this.pending = null;
            return this.pending || (this.joined ? "connected" : "disconnected");
        },
        joined() {
            return this.clientChannels && this.clientChannels.includes(this._channel);
        },
        _channel() { return this.channel || 'lobby'; },
        _client() { return this.$root.clientState && 
                           this.$root.clientState.client; }
    },
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    destroyed() { this.unregister(); },
    methods: {
        async register(client) {
            await client.deferred.init;
            this.ready = true;
            this.clientChannels = client.activeChannels.l;
        },
        unregister() {
            this.clientChannels = null;
        },
        async connect() {
            var c = this._client;
            if (c) {
                this._pending('connecting');
                if (c.hub && !c.hub.opened) await c.reconnect();
                c.join(this._channel, false);
            }
        },
        disconnect() {
            var c = this._client;
            if (c) {
                this._pending('disconnecting');
                c.close();
            }
        },
        _pending(val) {
            this.pending = val;
            //var upd = setInterval(() => this.update(), this.updateInterval)
            setTimeout(() => { /*clearInterval(upd);*/ this.pending = null; },
                this.connectTimeout);
        },
        toggle() {
            return (this.status === 'disconnected') ?
                this.connect() : this.disconnect();
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


Vue.component('p2p.documents-raw', {
    props: ['editable'],
    data: () => ({ docs: [], sync: undefined, menuOpen: undefined }),
    template: `
        <div :class="{'menu-open': !!menuOpen}">
            <plain-list ref="list" v-slot="{item}">
                <record-object :object="item"
                               @action="onAction(item, $event)"/>
            </plain-list>
            <div><button :disabled="!editable" @click="create">+</button></div>
            <hook :receiver="sync" on="change" @change="update"/>
            <p2p.document-context-menu ref="menu" :for="menuOpen"
                @action="menuAction" @close="menuClose"/>
        </div>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            if (state) this.sync = state.client.sync;
        }, {immediate: true});
        this.$refs.list.items = this.docs;
    },
    methods: {
        create() { this.sync.create(this._freshId()); },
        update({id, doc}) { this.setDoc(id, doc); },
        setDoc(id, doc) {
            var idx = this.docs.findIndex(d => d.id == id);
            if (idx >= 0)
                this.docs.splice(idx, 1, {id, doc});
            else
                this.docs.push({id, doc});
        },
        onAction(item, action) {
            var {o, t, slot} = this._locate(item, action);
            switch (action.type) {
            case 'input':
                o.path(action.key).set(action.value);
                break;
            case 'menu':
                action.$event.preventDefault();
                Object.assign(this.menuOpen = {}, {item, ...action});
                // ^ fields of `menuOpen` should be non-reactive
                this.$refs.menu.open(action.$event);
                break;
            case 'prop-create':
                (t || o).change(d => d[this._freshKey(d)] = '');
                break;
            case 'prop-delete':
                o.change(d => delete d[action.key]);
                break;
            case 'prop-rename':
                assert(action.value !== action.old);
                o.change(d => {
                    d[action.value] = d[action.old];
                    delete d[action.old];  // changes order :(
                });
                break;
            case 'elem-create':
                (t || o).change(d => d.push(''));
                break;
            case 'elem-delete':
                o.change(d => d.splice(action.key, 1));
                break;
            case 'make-object':
                if (slot) slot.set({});
                break;
            case 'make-array':
                if (slot) slot.set([]);
                break;
            case 'make-syncpad':
                if (slot)
                    slot.set(syncpad.FirepadShare.fromText(slot.get().toString()));
                break;         // ^ XXX
            case 'make-videoout':
                if (slot) {
                    slot.set({});
                    (async() => {
                        var v = await video.VideoOutgoing.acquire({audio: false});
                        v.embed(this.$root.clientState.client, slot);
                        window.v = v;
                    })();
                }
                break;
            case 'dev-globalvar':
                if (slot) { console.log("temp:", slot); window.temp = slot; }
                break;
            }
            this.$emit('doc:action', {docId: item.id, doc: item.doc, ...action});
        },
        menuAction(action) {
            if (this.menuOpen)
                this.onAction(this.menuOpen.item, {...this.menuOpen, ...action});
        },
        menuClose() {
            this.menuOpen = undefined;
            window.getSelection().collapseToStart();  // prevent sporadic mark of text
        },
        _freshId() {
            return cuid();
        },
        _freshKey(obj) {
            for (let i = 0;; i++) {
                let k = `key${i}`;
                if (!obj.hasOwnProperty(k)) return k;
            }
        },
        _locate(item, action) {
            var o = action.object, t = action.target, key = action.key;
            if (o === item) {
                return {t: this.sync.path(item.id)};
            }
            else {
                o = o && this.sync.object(item.id, o);
                t = t && t.kind === 'object' && this.sync.object(item.id, t.object);
                return {o, t, slot: o && key && o.path(key)};
            }
        }
    },
    components: {
        hook: eventHook()
    }
});

Vue.component('p2p.document-context-menu', {
    props: ['for'],
    template: `
        <vue-context ref="m" @close="$emit('close')">
          <li v-if="isObjectT">
            <a name="prop-create" @click="action">Create property</a></li>
          <li v-if="isObject && hasKey">
            <a name="prop-delete" @click="action">Delete property</a></li>
          <li v-if="isArrayT">
            <a name="elem-create" @click="action">Create element</a></li>
          <li v-if="isArray && hasKey">
            <a name="elem-delete" @click="action">Delete element</a></li>
          <li class="v-context__sub" :disabled="!has">
            <a>New</a>
            <ul class="v-context" role="menu">
              <li><a name="make-object" @click="action">Object</a></li>
              <li><a name="make-array" @click="action">Array</a></li>
              <li><a name="make-syncpad" @click="action">Text document</a></li>
              <li><a name="make-fileshare" @click="action">File share</a></li>
              <li><a name="make-videoout" @click="action">Video share</a></li>
            </ul>
          </li>
          <li>
            <a name="dev-globalvar" @click="action">Set as global variable</a></li>
        </vue-context>`,
    components: {VueContext},
    computed: {
        /* `for.object` is the (innermost) containing object/array */
        has() { return this.for && this.for.object; },
        hasKey() { return this.for && this.for.key != null; },
        isArray() { return this.has && Array.isArray(this.for.object); },
        isObject() { return this.has && !this.isArray; },
        /* `for.target` is the value that was right-clicked, if any */
        hasT() { return this.for && this.for.target && 
                        typeof this.for.target.object === 'object'; },
        isArrayT() { return this.hasT ? Array.isArray(this.for.target.object)
                                      : this.isArray },
        isObjectT() { return this.hasT ? !this.isArrayT : this.isObject; }
    },
    methods: {
        open(ev) { this.$refs.m.open(ev); },
        action(ev) { this.$emit('action', {type: ev.currentTarget.name}); }
    }
});


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
        hook: eventHook()
    }
});

function eventHook() { return  {
    props: ['receiver', 'on'],
    template: `<span></span>`,
    mounted() {
        this.$watch('receiver', receiver => {
            this.unregister(); if (receiver) this.register(receiver);
        }, {immediate: true});
    },
    destroyed() { this.unregister(); },
    methods: {
        register(receiver) {
            var handler = stream => this.$emit(this.on, stream);
            receiver.on(this.on, handler);
            this._registered = {receiver, handler};
        },
        unregister() {
            if (this._registered) {
                var {receiver, handler} = this._registered;
                receiver.removeListener(this.on, handler);
            }
        }
    }
}; }

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

const {SyncPad, FirepadShare} = require('./syncpad');

Vue.component('syncpad', {
    data: () => ({ slot: undefined }),
    template: `<codemirror ref="editor"/>`,
    mounted() {
        this.$watch('slot', slot => {
            if (this.pad) this.pad.destroy();
            this.pad = new SyncPad(this.$refs.editor.cm, slot);
        });
    }
});

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

Vue.component('codemirror', {
    template: `<div></div>`,
    mounted() {
        var CodeMirror = require('codemirror');
        this.cm = new CodeMirror(this.$el);
    }
});

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
                case 'text/automerge': this.kind = 'automerge-codemirror'; break;
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
                case 'text/automerge':
                    this.showText(slot, vm.kind);  return true;
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

const automerge = require('automerge');

/* generic display of objects (mainly for debugging) */
Vue.component('record-object', {
    props: ['object'],
    template: `
        <span class="record" :class="kind" @contextmenu.stop="menu">
            <template v-if="kind === 'text/plain'">
                <record-text :value="object" @action="fwd($event)"/>
            </template>
            <template v-else-if="kind === 'text/automerge' || kind == 'object/FirepadShare'">
                <button @click="select()">Text</button>
            </template>
            <template v-else-if="kind === 'object/FileShare'">
                <button @click="select()">File</button>
            </template>
            <template v-else-if="kind === 'object/VideoIncoming'">
                <p2p.video-view :videoincoming="coerced()"/>
            </template>
            <template v-else-if="kind === 'object'">
                <span class="record--key-value" v-for="(v,k) in object"
                      @contextmenu.stop="menu($event, {object, key: k})">
                    <record-text :value="k" class="record--key"
                         @action="renameProp($event, {object, key: k})"/><span class="record--key-sep">:</span>
                    <record-object :object="v"
                                   @action="fwd($event, {object, key: k})"/>
                </span>
            </template>
            <template v-else>{{object}}</template>
        </span>
    `,
    computed: {
        kind() {
            var o = this.object;
            // XXX
            if      (typeof o === 'string')            return 'text/plain';
            else if (o instanceof automerge.Text)      return 'text/automerge';
            else if (typeof o === 'object')
                return o.$type ? `object/${o.$type}` : 'object';
            else return 'value';
        },
        objectId() {
            return automerge.getObjectId(this.object);
        }
    },
    methods: {
        select() {
            this.$emit('action', {type: 'select', target: this});
        },
        menu(ev, props) {
            this.$emit('action', {type: 'menu', ...props, target: this, $event: ev});
        },
        renameProp(action, props) {
            switch (action.type) {
            case 'input':
                this.$emit('action', {...props, ...action, type: 'prop-rename'});
                break;
            }
        },
        fwd(action, props=undefined) {
            this.$emit('action', {...props, ...action});
        },
        coerced() {
            switch (this.kind) {
                // XXX
                case 'object/FirepadShare': return FirepadShare.from(this.object);
                case 'object/FileShare': return FileShare.from(this.object);
                case 'object/VideoIncoming': return VideoIncoming.from(this.object);
                default: return this.object;
            }
        }
    }
});

Vue.component('record-text', {
    props: ['value'],
    data: () => ({editing: false}),
    template: `
        <span class="record--editable" :class="{editing}" 
              :contenteditable="editing" @click="open"
              @blur="commit" @keypress="keyHandler"></span>`,
    mounted() {
        this.$el.innerText = this.value;  // {{value}} is too flaky
    },
    watch: {
        value(newval, oldval) {
            this.$el.innerText = newval;  // {{value}} is too flaky
        }
    },
    methods: {
        open() {
            if (!this.editing && typeof this.value == 'string') {
                this.editing = true;
                setTimeout(() => this.$el.focus(), 0);
                this.$emit('action', {type: 'edit:start'});
            }
        },
        commit() {
            var value;
            if (this.editing && (value = this.$el.innerText) !== this.value) {
                this.$emit('action', {type: 'input', value, old: this.value});
            }
            this.editing = false;
        },
        keyHandler(ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                this.commit();
            }
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
    constructor(dom) {
        this.vue = new Vue({
            el: dom,
            data: {clientState: undefined},
            computed: {
                ready() { return this.clientState && this.$refs.join.ready; }
            }
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

App.start = function (root) {
    window.app = new App(root || document.querySelector('#app'));
    window.addEventListener('beforeunload', () => { window.app = null; });
    return window.app;
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}