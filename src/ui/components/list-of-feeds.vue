<template>
    <div class="p2p-list-of-feeds">
        <source-feeds ref="source"/>
        <plain-list :items="feeds" v-slot="{item}">
            <span>{{keyHexShort(item)}} 
                <dl-progress :value="downloadProgress(item, stats[keyHex(item)])"/></span>
        </plain-list>
    </div>
</template>

<script>
import SourceFeeds from './source/feeds.vue';
import PlainList from './plain-list.vue';
import DlProgress from './dl-progress.vue';

import { keyHex, keyHexShort } from '../../net/crowd';


export default {
    data: () => ({ feeds: [], stats: {} }),
    mounted() {
        this.$refs.source.$watch('remote', (remote) => {
            this.feeds = remote;
        }, {immediate: true});
        this.stats = this.$refs.source.stats;
    },
    methods: {
        keyHex(feed) { return keyHex(feed); },
        keyHexShort(feed) { return keyHexShort(feed); },
        downloadProgress(feed, stats) {
            return stats && {total: feed.length,
                downloaded: stats.totals.downloadedBlocks,
                bytes: stats.totals.downloadedBytes
            };
        }
    },
    components: {
        SourceFeeds, PlainList, DlProgress
    }
}
</script>