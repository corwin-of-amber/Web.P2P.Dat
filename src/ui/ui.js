const Vue = require('vue/dist/vue'),
      moment = require('moment'),
      bidiText = typeof detectTextDir !== 'undefined' ? {detectTextDir} : require('./bidi-text');



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
    data: () => ({ peers: [] }),
    template: `<span></span>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        updatePeers(client) {
            this.peers.splice(0, Infinity, ...client.peers.keys());
        },
        register(client) {
            client.deferred.init.then(() => {
                var cb = () => this.updatePeers(client);
                client.on('peer-connect', cb);
                client.on('peer-disconnect', cb);
                cb();
                this._registered = {client, cb};
            })
        },
        unregister() {
            if (this._registered) {
                var {client, cb} = this._registered;
                client.removeListener('peer-connect', cb);
                client.removeListener('peer-disconnect', cb);
            }
        }
    }
});

Vue.component('p2p.list-of-peers', {
    template: `
        <div>
            <p2p.source-peers ref="source"/>
            <plain-list ref="list"/>
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
        disabled() { return this.status != 'disconnected' || !this._client(); }
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
    props: ['channel'],
    data: () => ({ pending: null, clientChannels: undefined }),
    template: `<span></span>`,
    computed: {
        status() {
            return this.pending || (this.joined ? "connected" : "disconnected");
        },
        joined() {
            return this.clientChannels && !!this.clientChannels.has(this._channel);
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
            var update = () => this.update();
            update();
            client.hub.on('open', update);
            client.swarm.on('open', update);
            client.on('disconnect', update);
            this._registered = {client, swarm: client.swarm, hub: client.hub, update};
        },
        unregister() {
            this.clientChannels = null;
            if (this._registered) {
                var {client, swarm, hub, update} = this._registered;
                hub.removeListener('open', update);
                swarm.removeListener('open', update);
                client.removeListener('disconnect', update);
                this._registered = undefined;
            }
        },
        update() {
            this.clientChannels = new Set(this._client.swarm.channels);
            if ((this.pending === 'connecting') === this.joined)  // sneaky
                this.pending = null;
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
            var upd = setInterval(() => this.update(), 500)
            setTimeout(() => { clearInterval(upd); this.pending = null; }, 5000);
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
    data: () => ({ docs: [] }),
    template: `
        <div>
            <plain-list ref="list" v-slot="{item}">
                <record-object :object="item"
                               @select="selectDoc(item, $event)"/>
            </plain-list>
        </div>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
        this.$refs.list.items = this.docs;
    },
    methods: {
        register(client) {
            var update = ({id, doc}) =>{
                this.setDoc(id, doc);
            };
            client.sync.on('change', update);
            this._registered = {sync: client.sync, update};
        },
        unregister() {
            if (this._registered) {
                var {sync, update} = this._registered;
                sync.removeListener('change', update);
            }
        },
        setDoc(id, doc) {
            for (let i = 0; i < this.docs.length; i++) {
                if (this.docs[i].id === id) {
                    this.docs.splice(i, 1, {id, doc});
                    return;
                }
            }
            this.docs.push({id, doc});
        },
        selectDoc(item, event) {
            this.$emit('select',
                Object.assign({docId: item.id, doc: item.doc}, event));
        }
    }
});


const {VideoIncoming} = require('../addons/video');

Vue.component('p2p.source-video', {
    props: ['videoincoming'],
    data: () => ({ streams: [], activePeers: [], clientState: undefined }),
    template: `
        <span>
            <p2p.source-peers ref="source"/>
            <peer-remote-streams v-for="id in relevantPeers" :key="id"
                  :id="id" ref="delegates" @update="rescanPeers()"/>
        </span>
    `,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.clientState = state;
            this.rescanPeers();
        }, {immediate: true});
        this.$watch('videoincoming', () => this.rescanPeers());
        this.activePeers = this.$refs.source.peers;
        window.vs = this;
    },
    computed: {
        peerId() { return this.videoincoming && this.videoincoming.peerId; },
        relevantPeers() {
            return this.activePeers.filter(id => this.isRelevantPeer(id));
        }
    },
    methods: {
        isRelevantPeer(id) { return !this.peerId || id === this.peerId },
        _set(streams) {
            this.streams.splice(0, Infinity, ...streams);
        },
        rescanPeers() {
            var client = this.clientState && this.clientState.client;
            if (client) {
                this._set(this.receiveFrom(client));
            }
        },
        receiveFrom(client) {
            if (this.videoincoming)
                return this.videoincoming.receive(client);
            else
                return VideoIncoming.receiveRemote(client);
        }
    },
    components: {
        'peer-remote-streams': {
            props: ['id'],
            data: () => ({ clientState: undefined }),
            template: `
                <hook :receiver="current" on="stream" @stream="onStream"/>
            `,
            computed: {
                current() { return this.getPeer(this.id); }
            },
            mounted() {
                this.$root.$watch('clientState', (state) => {
                    this.clientState = state;
                    this.collectStreams();
                }, {immediate: true});
            },
            methods: {
                getPeer(id) {
                    var client = this.clientState && this.clientState.client;
                    return client && client.getPeer(id); 
                },
                collectStreams() {
                    var peer = this.current;
                    this.streams = peer ? peer._remoteStreams : [];
                    this.$emit('update');
                },
                onStream(stream) { this.collectStreams(); }
            },
            components: {
                hook: eventHook()
            }
        }
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
                case 'text/firepad': this.kind = 'syncpad'; break;
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
                case 'text/firepad':
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
        <span class="record" :class="kind">
            <template v-if="kind === 'text/automerge' || kind == 'text/firepad'">
                <button @click="select()">Text</button>
            </template>
            <template v-else-if="kind === 'file'">
                <button @click="select()">File</button>
            </template>
            <template v-else-if="kind === 'video'">
                <p2p.video-view :videoincoming="coerced()"/>
            </template>
            <template v-else-if="kind === 'object'">
                <span v-for="(v,k) in object">
                    {{k}}: <record-object :object="v"
                                          @select="$emit('select', $event)"/>
                    <br/>
                </span>
            </template>
            <template v-else>{{object}}</template>
        </span>
    `,
    computed: {
        kind() {
            var o = this.object;
            // XXX
            if (o instanceof automerge.Text)           return 'text/automerge';
            else if (o && o.$type === 'FirepadShare')  return 'text/firepad'
            else if (o && o.$type === 'FileShare')     return 'file';
            else if (o && o.$type === 'VideoIncoming') return 'video';
            else if (typeof(o) === 'object')           return 'object';
            else return 'value';
        },
        objectId() {
            return automerge.getObjectId(this.object);
        }
    },
    methods: {
        select() {
            this.$emit('select', {target: this});
        },
        coerced() {
            switch (this.kind) {
                case 'text/firepad': return FirepadShare.from(this.object);
                case 'video': return VideoIncoming.from(this.object);
                case 'file': return FileShare.from(this.object);
                default: return this.object;
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
            data: {clientState: undefined}
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