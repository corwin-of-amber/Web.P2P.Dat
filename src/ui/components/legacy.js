/**
 * These need to be ported and are currently disabled.
 */

import * as bidiText from '../bidi-text';



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
                    let dtf = new Intl.DateTimeFormat('en', {hour12: false, hour: '2-digit', minute: '2-digit'});
                    return dtf.format(this.message.timestamp);
                },
                dir() {
                    return bidiText.detectTextDir(this.message.message || '');
                }
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
