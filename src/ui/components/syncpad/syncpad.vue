<template>
    <codemirror ref="editor"/>
</template>

<script>
import { lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import codemirror from './codemirror6.vue';
import { SyncPad } from '../../../addons/syncpad';


export default {
    data: () => ({ slot: undefined }),
    mounted() {
        this.$watch('slot', () => this.refresh());
    },
    methods: {
        create() {
            this.slot.set(syncpad.FirepadShare.fromText('a'));
            this.refresh();
        },
        refresh() {
            if (this.pad) this.pad.destroy();
            this.pad = new SyncPad(this.$refs.editor.cm, this.slot, {
                extensions: [lineNumbers(), highlightActiveLineGutter()]
            });
        }
    },
    components: { codemirror }
}
</script>