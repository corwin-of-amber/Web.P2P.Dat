<template>
</template>

<script>
import Vue from 'vue';
import EventHook from '../event-hook.vue';
import { keyHex, keyHexShort } from '../../../net/crowd';


Vue.component('p2p.source-feeds', {
    data: () => ({ remote: [], stats: {} }),
    template: `
        <span>
            <template v-for="feed in remote">
                <hook :receiver="feed" on="download" @download="onDownload(feed)"/>
            </template>
        </span>
    `,
    mounted() {
        this.$root.$watch('clientState', (state) => {
            this.unregister(); if (state) this.register(state.client);
        }, {immediate: true});
    },
    methods: {
        register(client) {
            this.remote = client.crowd.remoteFeeds;
        },
        unregister() {
        },
        onDownload(feed) {
            var stats = feed.stats;
            Vue.set(this.stats, keyHex(feed), stats);
        }
    },
    components: {
        hook: EventHook
    }
});
</script>