<template>
    <span class="p2p-button-join" :class="status">
        <source-status ref="source" :channel="channel"/>
        <button @click="onClick()" :disabled="disabled">
            <slot>{{caption}}</slot>
        </button>
        <label>{{status}}</label>
    </span>
</template>

<script>
import SourceStatus from './source/status.vue';

export default {
    props: ['channel'],
    data: () => ({ status: undefined }),
    computed: {
        disabled() { return this.status == 'connecting' || this.status == 'disconnecting' || !this._client(); },
        caption() { return this.status == 'connected' ? 'Leave' : 'Join'; },
        ready() { return this.$refs.source && this.$refs.source.ready; }
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
            if (this.status == 'connected')
                this.$refs.source.disconnect();
            else
                this.$refs.source.connect();
        }
    },
    components: { SourceStatus }
}
</script>