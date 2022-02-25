<template>
    <div class="list-of-peers">
        <p2p.source-peers ref="source"/>
        <plain-list :items="peers" v-slot="{item}">
            {{item.id}}
        </plain-list>
    </div>
</template>

<style>
div.list-of-peers ul {
    padding-inline-start: 1.5em;
}
div.list-of-peers li {
    text-overflow: ellipsis;
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
