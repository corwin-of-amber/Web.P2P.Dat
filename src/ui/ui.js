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
        this.$root.$watch('client', (c) => {
            c.deferred.init.promise.then(() => {
                this.updatePeers(c.swarm.webrtc);
                c.swarm.webrtc.on('connection', () => this.updatePeers(c.swarm.webrtc));
                c.swarm.webrtc.on('connection-closed', () => this.updatePeers(c.swarm.webrtc));
            });
        });
    },
    methods: {
        updatePeers(webrtc) {
            this.$refs.list.items = getPeers(webrtc);
        }
    }
});

Vue.component('p2p.list-of-messages', {
    template: `<plain-list ref="list"/>`,
    data: () => ({ messages: ['(Welcome)']}),
    mounted() {
        this.$root.$watch('client', (c) => {
            c.on('append', ev => {
                this.messages.push(ev.data);
            });
        });
        this.$refs.list.items = this.messages;
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
            data: {client: undefined}
        });
    }
    attach(client) {
        this.vue.client = client;
    }
}

App.start = function (root) {
    window.app = new App(root || document.querySelector('#app'));
    return window.app;
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}