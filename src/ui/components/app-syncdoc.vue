<template>
    <div id="app">
        <button-join ref="join" :channel="channel"></button-join>
        <list-of-peers ref="peers" :title="true"></list-of-peers>
        <documents-raw ref="documents" :editable="ready"
            @doc:action="$emit('doc:action', $event)"></documents-raw>
        <list-of-feeds ref="feeds"></list-of-feeds>
        <preview-pane ref="preview"></preview-pane>
    </div>
</template>

<script>
import PreviewPane from './preview-pane.vue';
import SourceStatus from './source/status.vue';
import ListOfPeers from './list-of-peers.vue';
import ListOfFeeds from './list-of-feeds.vue';
import ButtonJoin from './button-join.vue';
import DocumentsRaw from './treedoc/documents-raw.vue';
import syncpad from './syncpad/syncpad.vue';


export default {
    props: ['channel'],
    data: () => ({clientState: undefined}),
    computed: {
        ready() { return this.clientState && this.$refs.join.ready; }
    },
    components: { SourceStatus, ButtonJoin, ListOfPeers, ListOfFeeds,
                  DocumentsRaw, PreviewPane, syncpad }
}
</script>