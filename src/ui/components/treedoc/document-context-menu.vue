<template>
    <vue-context ref="m" @close="$emit('close')">
        <li v-if="isObjectT">
          <a name="prop-create" @click="action">Create property</a></li>
        <li v-if="isObject && hasKey">
          <a name="prop-delete" @click="action">Delete property</a></li>
        <li v-if="isArrayT">
          <a name="elem-create" @click="action">Create element</a></li>
        <li v-if="isArray && hasKey">
          <a name="elem-delete" @click="action">Delete element</a></li>
        <li class="v-context__sub" :disabled="!has">
          <a>New</a>
          <ul class="v-context" role="menu">
            <li><a name="make-object" @click="action">Object</a></li>
            <li><a name="make-array" @click="action">Array</a></li>
            <li><a name="make-syncpad" @click="action">Text document</a></li>
            <li><a name="make-fileshare" @click="action">File share</a></li>
            <li><a name="make-videoout" @click="action">Video share</a></li>
          </ul>
        </li>
        <li>
          <a name="dev-globalvar" @click="action">Set as global variable</a></li>
    </vue-context>
</template>

<script>
import VueContext from 'vue-context';

export default {
    props: ['for'],
    components: {VueContext},
    computed: {
        /* `for.object` is the (innermost) containing object/array */
        has() { return this.for && this.for.object; },
        hasKey() { return this.for && this.for.key != null; },
        isArray() { return this.has && Array.isArray(this.for.object); },
        isObject() { return this.has && !this.isArray; },
        /* `for.target` is the value that was right-clicked, if any */
        hasT() { return this.for && this.for.target && 
                        typeof this.for.target.object === 'object'; },
        isArrayT() { return this.hasT ? Array.isArray(this.for.target.object)
                                      : this.isArray },
        isObjectT() { return this.hasT ? !this.isArrayT : this.isObject; }
    },
    methods: {
        open(ev) { this.$refs.m.open(ev); },
        action(ev) { this.$emit('action', {type: ev.currentTarget.name}); }
    }
}
</script>

<style>

</style>