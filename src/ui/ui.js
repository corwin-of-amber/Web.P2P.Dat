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
        c1.deferred.init.promise.then(() => {
            this.updatePeers(c1.swarm.webrtc);
            c1.swarm.on('connection', () => this.updatePeers(c1.swarm.webrtc));
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
    data: () => ({ messages: ['a', 'b', 'c']}),
    mounted() {
        this.$refs.list.items = this.messages;
        c1.on('append', ev => {
            this.messages.push(ev.data);
        });
    },
    methods: {
        updateMessages(feed) {
            readMessages(feed, this.$refs.list.items);
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
            el: dom
        });
    }
}

App.start = function (root) {
    window.app = new App(root || document.querySelector('#app'));
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}