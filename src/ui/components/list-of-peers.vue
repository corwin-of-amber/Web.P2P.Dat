<template>
    <div>
        <p2p.source-peers ref="source"/>
        <plain-list :items="peers" v-slot="{item}">
            {{item.id}}
        </plain-list>
    </div>
</template>

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
