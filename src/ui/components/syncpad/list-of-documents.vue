<template>
    <div class="list-of-documents ui-font-default">
        <div class="list-title">
            <span>Documents</span>
            <div class="toolbar">
                <button @click="createText">+</button>
            </div>
        </div>
        <file-list ref="list" :files="files" @action="docAction"/>
        <source-documents ref="source" @created="onCreated"/>
        <context-menu ref="menu" @action="menuAction">
            <item name="rename">Rename</item>
        </context-menu>
    </div>
</template>

<style>
div.list-of-documents > .file-list {
    font-size: 11pt;
}
</style>

<style scoped>
div.list-title {
    display: flex;
    margin-bottom: 4px;
}
div.list-title > span {
    flex-grow: 1;
    align-self: flex-end;
    font-size: 10pt;
}
</style>

<script>
import SourceDocuments from '../source/documents.vue';
import syncpad from '../../../addons/syncpad';
import FileList from '../../../../packages/file-list/index.vue';
import ContextMenu from '../../../../packages/context-menu/index.vue';


export default {
    props: ['autoselect'],
    data: () => ({docs: [], selected: null, autoselectMode: this.autoselect ?? true,
                  files: []}),
    mounted() {
        this.docs = this.$refs.source.docs;
        // `files` must be a data field because `file-list` should be able to modify it
        this.$watch('docs', (docs) => {
            this.files = docs.map(doc =>   // order is lost on recompute :(
                ({name: doc.id, displayName: doc.doc.meta?.name, doc}));
        });
    },
    computed: {
        sync() { return this.$refs.source?.sync; },
    },
    methods: {
        select(entry) {
            this.selected = entry.id;
            this.$refs.list.select([entry.id]);
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
            slot.set(syncpad.FirepadShare.fromText(''));
            this.$emit('created', {initiator: true, id, slot});
            Promise.resolve().then(() => this.selectId(id));
        },
        syncpadSlot(docId) {
            return this.sync.path(docId, ['syncpad']);
        },

        docAction(ev) {
            switch (ev.type) {
                case 'select': this.select(ev.item.doc); break;
                case 'menu': this.$refs.menu.open(ev.$event, ev); break;
                case 'rename':
                    this.$emit('set-meta', {id: ev.item.doc.id, data: {name: ev.to}});
                    break;
            }
        },
        menuAction(ev) {
            switch (ev.type) {
                case 'rename':
                    this.$refs.list.renameStart(ev.for.path, {set: 'displayName'});
                    break;
            }
        }
    },
    components: { SourceDocuments, FileList, ContextMenu, Item: ContextMenu.Item }
}
</script>