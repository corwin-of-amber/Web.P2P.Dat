<template>
    <span>
        <hook :receiver="sync" on="change" @change="update"/>
    </span>
</template>

<script>
import EventHook from '../event-hook.vue';

export default {
    data: () => ({ sync: null, docs: [] }),
    mounted() {
        this.$root.$watch('clientState', (state) => {
            if (state) this.sync = state.client.sync;
        }, {immediate: true});
    },
    destroyed() { this.unregister(); },
    methods: {
        update({id, doc}) { this.setDoc(id, doc); },
        setDoc(id, doc) {
            var idx = this.docs.findIndex(d => d.id == id);
            if (idx >= 0) {
                this.docs.splice(idx, 1, {id, doc});
            }
            else {
                this.docs.push({id, doc});
                this.$emit('created', {id, doc});
            }
        }
    },
    components: { hook: EventHook }
}
</script>