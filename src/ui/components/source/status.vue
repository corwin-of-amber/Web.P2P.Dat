<template>
    <span></span>
</template>

<script>
export default {
    props: {
        channel: String,
        updateInterval: {type: Number, default: 500},
        connectTimeout: {type: Number, default: 25000}
    },
    data: () => ({ pending: null, clientChannels: undefined, ready: false }),
    computed: {
        status() {
            if ((this.pending === 'connecting') === this.joined)  // sneaky
                this.pending = null;
            return this.pending || (this.joined ? "connected" : "disconnected");
        },
        joined() {
            return this.clientChannels && this.clientChannels.includes(this._channel);
        },
        _channel() { return this.channel || 'lobby'; },
        _client() { return this.$root.clientState && 
                           this.$root.clientState.client; }
    },
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    destroyed() { this.unregister(); },
    methods: {
        async register(client) {
            await client.deferred.init;
            this.ready = true;
            this.clientChannels = client.activeChannels.l;
        },
        unregister() {
            this.clientChannels = null;
        },
        async connect() {
            var c = this._client;
            if (c) {
                this._pending('connecting');
                if (c.hub && !c.hub.opened) await c.reconnect();
                c.join(this._channel);
            }
        },
        disconnect() {
            var c = this._client;
            if (c) {
                this._pending('disconnecting');
                c.close();
            }
        },
        _pending(val) {
            this.pending = val;
            setTimeout(() => { this.pending = null; },
                this.connectTimeout);
        },
        toggle() {
            return (this.status === 'disconnected') ?
                this.connect() : this.disconnect();
        }
    }
}
</script>