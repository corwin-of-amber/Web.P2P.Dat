<template>
    <span>
        <source-peers ref="source"/>
        <hook v-for="peer in activePeers" :key="peer.id"
            :receiver="peer.peer" on="stream" @stream="refresh"/>
    </span>
</template>

<script>
import EventHook from '../event-hook.vue';
import SourcePeers from '../source/peers.vue';


export default {
    props: ['videoincoming'],
    data: () => ({ streams: [], activePeers: [] }),
    template: `
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
        SourcePeers, hook: EventHook
    }
}
</script>