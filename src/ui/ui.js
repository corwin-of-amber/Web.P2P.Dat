const Vue = require('vue/dist/vue'),
      moment = require('moment'),
      bidiText = typeof detectTextDir !== 'undefined' ? {detectTextDir} : require('./bidi-text');



Vue.component('plain-list', {
    data: () => ({ items: [] }),
    template: `
        <ul class="plain-list">
            <li v-for="item in items">
                <slot v-bind:item="item">{{item}}</slot>
            </li>
        </ul>
    `
});


Vue.component('p2p.list-of-peers', {
    template: `<plain-list ref="list"/>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        updatePeers(client) {
            this.$refs.list.items = [...client.peers.keys()];
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
            client.on('append', cb);
            this._registered = {client, cb};
        },
        unregister() {
            if (this._registered) {
                var {client, cb} = this._registered;
                client.removeListener('append', cb);
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


Vue.component('p2p.button-join', {
    props: ['channel'],
    data: () => ({ pending: false, clientChannels: undefined }),
    template: `
        <span class="p2p-button-join" :class="status">
            <button @click="onClick()" :disabled="disabled">
                <slot>Join</slot>
            </button>
            <label>{{status}}</label>
        </span>`,
    computed: {
        status() {
            return this.joined ? "connected" :
                (this.pending ? "connecting" : "disconnected");
        },
        joined() {
            return this.clientChannels && !!this.clientChannels.has(this._channel);
        },
        disabled() { return !this._client || this.status != 'disconnected'; },
        _channel() { return this.channel || 'lobby'; },
        _client() { return this.$root.clientState && 
                           this.$root.clientState.client; }
    },
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        async register(client) {
            await client.deferred.init;
            var update = () => this.clientChannels =
                new Set(client.swarm.channels);
            update();
            client.swarm.webrtc.on('connection', update);
            client.swarm.webrtc.on('close', update);
        },
        unregister() {
            this.clientChannels = null;
        },
        onClick() {
            var c = this._client;
            if (c) {
                c.join(this._channel, false);
                this.pending = true;
                setTimeout(() => this.pending = false, 5000);
            }
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

Vue.component('p2p.video-source', {
    props: ['peers', 'objectId'],
    data: () => ({ streams: [] }),
    template: `<span></span>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
        this.$watch('peers', () => {
            this.rescanPeers();
        });
    },
    methods: {
        register(client) {
            var onconnect = (peer, info) => this.onPeerConnect(peer.id);
            client.on('peer-connect', onconnect);
            this._registered = {client, onconnect};
            this.rescanPeers();
        },
        unregister() {
            if (this._registered) {
                var {client, onconnect} = this._registered;
                client.removeListener('peer-connect', onconnect);
                this._registered = undefined;
            }
        },
        isRelevant(id) { return !this.peers || this.peers.includes(id); },
        onPeerConnect(id) {
            if (this.isRelevant(id)) {
                var peer = this._registered.client.getPeer(id);
                if (peer) {
                    this._set(peer._remoteStreams);
                    peer.on('stream', stream => {
                        console.warn("received stream", id, stream);
                        this._set([stream]); // only keep one?..
                    });
                }
            }
        },
        rescanPeers() {
            var client = this._registered && this._registered.client;
            if (client) {
                this._rescanSelf(client)
                for (let id of client.peers.keys()) {
                    this.onPeerConnect(id);
                }
            }
        },
        _set(streams) {
            this.streams.splice(0, Infinity, ...streams);
        },
        _rescanSelf(client) {
            if (this.isRelevant(client.id) && client._outgoingVideos) {
                var ovs = client._outgoingVideos;
                ovs = this.objectId ? [ovs.get(this.objectId)] : [...ovs.values()];
                this._set(ovs.map(x => x && x.stream).filter(x => x));
            }
        }
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
                        this.$el.append(VideoIncoming.receive(stream));
                    }
                }, {immediate: true});
            }
        }
    }

});

Vue.component('p2p.video-view', {
    props: ['peers', 'objectId'],
    template: `
        <div class="p2p-video-view">
            <p2p.video-source ref="source" :peers="peers" :objectId="objectId"/>
            <video-widget ref="view"/>
        </div>
    `,
    mounted() {
        this.$refs.view.streams = this.$refs.source.streams;
    }
});


Vue.component('syncpad', {
    data: () => ({ slot: undefined }),
    template: `<codemirror ref="editor"/>`,
    mounted() {
        this.$watch('slot', slot => {
            const {SyncPad} = require('./syncpad');
            if (this.pad) this.pad.destroy();
            this.pad = new SyncPad(this.$refs.editor.cm, slot);
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

const automerge = require('automerge');

/* generic display of objects (mainly for debugging) */
Vue.component('record-object', {
    props: ['object'],
    template: `
        <span class="record" :class="kind">
            <template v-if="kind === 'text'">
                <button @click="select()">Text</button>
            </template>
            <template v-else-if="kind === 'video'">
                <p2p.video-view :peers="[object.peerId]" :objectId="objectId"/>
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
            if (o instanceof automerge.Text) return 'text'; // XXX
            else if (o && o.$type === 'VideoIncoming') return 'video'; // XXX
            else if (typeof(o) === 'object') return 'object';
            else return 'value';
        },
        objectId() {
            return automerge.getObjectId(this.object);
        }
    },
    methods: {
        select() {
            this.$emit('select', {target: this});
        }
    }
});


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
    return window.app;
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}