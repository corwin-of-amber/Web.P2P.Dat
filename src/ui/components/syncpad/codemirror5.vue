<template>
    <div></div>
</template>

<script>
export default {
    mounted() {
        var CodeMirror = require('codemirror');
        this.cm = new CodeMirror(this.$el);
    }
}
</script>