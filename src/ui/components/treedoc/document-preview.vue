<template>
    <div>
        <component :is="kind" ref="object"></component>
    </div>
</template>

<script>
import syncpad from '../syncpad/syncpad.vue';


export default {
    data: () => ({ kind: '', object: undefined }),
    methods: {
        showText(slot, kind) {
            switch (kind) {
                case 'object/FirepadShare': this.kind = 'syncpad'; break;
                //case 'text/automerge': this.kind = 'automerge-codemirror'; break;
                default:
                    throw new Error(`unknown text document, kind '${kind}'`);
            }
            process.nextTick(() => this.$refs.object.slot = slot);
        },
        showFile(fileshare) {
            this.kind = 'p2p.file-object';
            process.nextTick(() => this.$refs.object.fileshare = fileshare);
        },
        showObject(vm, slot) {
            switch (vm.kind) {
                case 'object/FirepadShare':
                //case 'text/automerge':
                    this.showText(slot, vm.kind);  return true;
                case 'file':
                    this.showFile(vm.coerced());   return true;
            }
            return false;
        }        
    },
    components: { syncpad }
}
</script>