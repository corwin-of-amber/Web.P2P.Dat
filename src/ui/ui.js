
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
        c.deferred.init.promise.then(() => {
            this.updatePeers(c.swarm.webrtc);
            c.swarm.on('connection', () => this.updatePeers(c.swarm.webrtc));
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
    mounted() {
        c.deferred.ready.promise.then(() => {
            console.log(c.feed);
            this.updateMessages(c.feed);
            c.feed.on('append', () => this.updateMessages(c.feed));
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

function readMessages(feed, list) {
    // use splice() to force Vue to update,
    // but make sure there are enough elements first.
    var set = (i, v) => { list[i] = v; list.splice(i, 1, v); }

    for (let i = 0; i < feed.length; i++) {
        feed.get(i, (_, data) => set(i, data));
    }
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