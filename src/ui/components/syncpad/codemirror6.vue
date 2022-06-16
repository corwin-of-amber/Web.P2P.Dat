<template>
    <div></div>
</template>

<script>
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';


export default {
    mounted() {
        this.cm = new EditorView({parent: this.$el});
    }
}
</script>