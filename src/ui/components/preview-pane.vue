<template>
    <drawer ref="drawer">
        <document-preview ref="preview"></document-preview>
    </drawer>
</template>

<script>
import Drawer from './infra/drawer.vue';
import DocumentPreview from './treedoc/document-preview.vue';


class Watch {
    constructor(vue, prop, handler) {
        this._registered = {unwatch: vue.$watch(prop, handler)};
    }
    destroy() {
        this._registered.unwatch();
    }
}


export default {
    methods: {
        select(ev) {
            var client = this.$root.clientState.client;
            if (client && client.sync) {
                var slot = client.sync.object(ev.docId, ev.target.object);
                this.zoomObject(ev.target, slot);
            }
        },

        showObject(vm, slot) {
            if (this.$refs.preview.showObject(vm, slot))
                this.$refs.drawer.open = true;
        },

        zoomObject(vm, slot) {
            this.showObject(vm, slot);
            if (this.watch) this.watch.destroy();
            this.watch = new Watch(vm, 'object', () => this.showObject(vm, slot));
        }
    },
    components: { Drawer, DocumentPreview }
}
</script>