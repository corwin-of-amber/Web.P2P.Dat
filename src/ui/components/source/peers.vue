<template>
    <span class="source-placeholder"></span>  
</template>

<script>
import { EventHook } from '../../../core/events';

export default {
    data: () => ({ self: undefined, peers: [] }),
    mounted() {
        this.ehs = {'join': new EventHook, 'leave': new EventHook};
        this.$root.$watch('clientState', (state) => {
            if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        updatePeers(client) {
            this.self = client;
            this.peers.splice(0, Infinity, ...client.getPeers());
        },
        async register(client) {
            await client.deferred.init;
            var cb = () => this.updatePeers(client);
            this.ehs.join.attach(client, 'peer:join', cb);
            this.ehs.leave.attach(client, 'peer:leave', cb);
            cb();
        },
    }
}
</script>