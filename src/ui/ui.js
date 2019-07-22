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
            this.unregister(); this.register(state.client);
        });
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
            this.unregister(); this.register(state.client);
        });
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
            this.unregister(); this.register(state.client);
        });
    },
    methods: {
        async register(client) {
            await client.deferred.init;
            var update = () => this.clientChannels =
                new Set(client.swarm.webrtc.channels.keys());
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
                <record-object :object="item"/>
            </plain-list>
        </div>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); this.register(state.client);
        });
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
        }
    }
});


const {ScreenShare} = require('../addons/share-screen');

Vue.component('p2p.video-source', {
    data: () => ({ streams: [] }),
    template: `<span></span>`,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); this.register(state.client);
        });
    },
    methods: {
        register(client) {
            var onconnect = (peer, info) => {
                console.warn('onconnect', peer, info);
                client.getPeer(peer).on('stream', stream => {
                    console.warn("received stream", peer.id, stream);
                    this.streams.splice(0, Infinity, stream); // only store one?..
                });
            };
            client.on('peer-connect', onconnect);
            this._registered = {client, onconnect};
        },
        unregister() {
            if (this._registered) {
                var {client, onconnect} = this._registered;
                client.removeListener('peer-connect', onconnect);
            }
        }
    }
});

Vue.component('p2p.video-view', {
    data: () => ({ streams: [] }),
    template: `
        <div class="p2p-video-view">
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
                console.warn('mounted', this.stream);
                this.$watch('stream', (stream) => {
                    this.$el.innerHTML = '';
                    if (stream instanceof MediaStream) {
                        this.$el.append(ScreenShare.receive(stream));
                    }
                }, {immediate: true});
            }
        }
    }

});

Vue.component('p2p.video-chat', {
    template: `
        <div class="p2p-video-chat">
            <p2p.video-source ref="source"/>
            <p2p.video-view ref="view"/>
        </div>
    `,
    mounted() {
        this.$refs.view.streams = this.$refs.source.streams;
    }
});


Vue.component('reactive-editor', {
    template: `
        <div></div>
    `,
    mounted() {
        var CodeMirror = require('codemirror');
        this.cm = new CodeMirror(this.$el);
    }
})

/* generic display of objects (mainly for debugging) */
Vue.component('record-object', {
    props: ['object'],
    template: `
        <span :class="typeof(object) === 'object' ? 'object' : 'value'">
            <template v-if="typeof(object) === 'object'">
                <span v-for="(v,k) in object">
                    {{k}}: <record-object :object="v"/><br/>
                </span>
            </template>
            <template v-else>{{object}}</template>
        </span>
    `
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
    }
}

App.start = function (root) {
    window.app = new App(root || document.querySelector('#app'));
    return window.app;
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}