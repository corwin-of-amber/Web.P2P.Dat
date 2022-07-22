<template>
    <div id="app" class="syncpad-ide">
        <source-status ref="source" :channel="channel"></source-status>
        <div id="outline-area">
            <button-join ref="join" :channel="channel"></button-join>
            <list-of-peers ref="peers" :title="true"></list-of-peers>
            <list-of-documents ref="docs"
                @created="$event.initiator && $emit('open', $event)"
                @select="$emit('open', $event)"></list-of-documents>
        </div>
        <div id="editor-area">
            <syncpad ref="pad"></syncpad>
        </div>
    </div>
</template>

<script>
import SourceStatus from './source/status.vue';
import ListOfPeers from './list-of-peers.vue';
import ButtonJoin from './button-join.vue';
import ListOfDocuments from './syncpad/list-of-documents.vue';
import syncpad from './syncpad/syncpad.vue';


export default {
    props: ['channel'],
    data: () => ({clientState: undefined}),
    computed: {
        ready() { return this.clientState && this.$refs.join.ready; }
    },
    components: { SourceStatus, ButtonJoin, ListOfPeers,
                  ListOfDocuments, syncpad }
}
</script>