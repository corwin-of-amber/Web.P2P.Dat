<template>
    <div class="list-of-documents">
        <div class="toolbar">
            <button @click="createText">+</button>
        </div>
        <ul>
            <li v-for="doc in docs" :key="doc.id"
                :class="{selected: doc.id === selected}"
                @click="select(doc)">{{doc.id}}</li>
        </ul>
        <source-documents ref="source" @created="onCreated"/>
    </div>
</template>

<style scoped>
ul {
    list-style: none;
    padding: 0;
    margin: 2px 0;
    user-select: none;
}
li {
    padding: 0 4px;
    cursor: pointer;
}
li.selected {
    background: blue;
    color: white;
}
</style>

<script>
import SourceDocuments from '../source/documents.vue';
import syncpad from '../../../addons/syncpad';


export default {
    props: ['autoselect'],
    data: () => ({docs: [], selected: null, autoselectMode: this.autoselect ?? true}),
    mounted() {
        this.docs = this.$refs.source.docs;
    },
    computed: {
        sync() { return this.$refs.source?.sync; }
    },
    methods: {
        select(entry) {
            this.selected = entry.id;
            this.$emit('select', {...entry, slot: this.syncpadSlot(entry.id)});
        },
        selectId(id) {
            var doc = this.docs.find(e => e.id === id);
            if (doc) this.select(doc);
        },
        onCreated() {
            if (this.autoselectMode) {
                this.autoselectMode = false;
                setTimeout(() =>
                    this.docs.length && this.select(this.docs[0]), 100);
            }
        },
        createText() {
            var i = 1, id;
            while (this.sync.docs.getDoc(id = `d${i}`)) i++;
            var slot = this.syncpadSlot(id);
            slot.set(syncpad.FirepadShare.fromText('a ' + id));
            this.$emit('created', {initiator: true, id, slot});
            Promise.resolve().then(() => this.selectId(id));
        },
        syncpadSlot(docId) {
            return this.sync.path(docId, ['syncpad']);
        }
    },
    components: { SourceDocuments }
}
</script>