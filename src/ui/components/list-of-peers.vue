<template>
    <div class="list-of-peers ui-font-default">
        <div class="list-title" v-if="title == 'always' || title && peers.length">
            <span>Peers</span>
        </div>
        <plain-list :items="peers" v-slot="{item}">
            {{item.id}}
        </plain-list>
        <source-peers ref="source"/>
    </div>
</template>

<style>
div.list-of-peers ul {
    padding-inline-start: 1.5em;
    margin-top: 3px;
}
div.list-of-peers li {
    text-overflow: ellipsis;
    font-size: 9pt;
}
div.list-title {
    margin-top: 1em;
}
</style>

<script>
import SourcePeers from './source/peers.vue';
import PlainList from './plain-list.vue';

export default {
    props: ['title'],
    data: () => ({ peers: [] }),
    mounted() {
        this.peers = this.$refs.source.peers;
    },
    components: { SourcePeers, PlainList }
}
</script>
