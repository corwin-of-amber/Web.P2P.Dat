<template>
    <div class="list-of-peers ui-font-default">
        <div class="list-title" v-if="peers.length">
            <span>Peers</span>
        </div>
        <plain-list :items="peers" v-slot="{item}">
            {{item.id}}
        </plain-list>
        <p2p.source-peers ref="source"/>
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
import PlainList from './plain-list.vue';

export default {
    data: () => ({ peers: [] }),
    mounted() {
        this.peers = this.$refs.source.peers;
    },
    components: { PlainList }
}
</script>
