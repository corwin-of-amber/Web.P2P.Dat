const Vue = require('vue/dist/vue');



Vue.component('plain-list', {
    data: function() {
        return {
            items: []
        };
    },
    template: `
    <ul class="plain-list">
        <li v-for="item in items">{{item}}</li>
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
        updatePeers(webrtc) {
            this.$refs.list.items = getPeers(webrtc);
        },
        register(client) {
            client.deferred.init.then(() => {
                var cb = () => this.updatePeers(client.swarm.webrtc);
                client.swarm.webrtc.on('connection', cb);
                client.swarm.webrtc.on('connection-closed', cb);
                cb();
                this._registered = {webrtc: client.swarm.webrtc, cb};
            })
        },
        unregister() {
            if (this._registered) {
                var {webrtc, cb} = this._registered;
                webrtc.removeListener('connection', cb);
                webrtc.removeListener('connection-closed', cb);
            }
        }
    }
});

Vue.component('p2p.list-of-messages', {
    template: `<plain-list ref="list"/>`,
    data: () => ({ messages: ['(Welcome)']}),
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); this.register(state.client);
        });
        this.$refs.list.items = this.messages;
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

function getPeers(webrtcSwarm) {
    var l = [];
    for (let [k, {peers}] of webrtcSwarm.channels) {
        l.push(...peers.keys());
    }
    return l;
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
    }
}

App.start = function (root) {
    window.app = new App(root || document.querySelector('#app'));
    return window.app;
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}