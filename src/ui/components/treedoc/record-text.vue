<template>
    <span class="record--editable" :class="{editing}" 
            :contenteditable="editing" @click="open"
            @blur="commit" @keypress="keyHandler"></span>
</template>

<script>
export default {
    props: ['value'],
    data: () => ({editing: false}),
    mounted() {
        this.$el.innerText = this.value;  // {{value}} is too flaky
    },
    watch: {
        value(newval, oldval) {
            this.$el.innerText = newval;  // {{value}} is too flaky
        }
    },
    methods: {
        open() {
            if (!this.editing && typeof this.value == 'string') {
                this.editing = true;
                setTimeout(() => this.$el.focus(), 0);
                this.$emit('action', {type: 'edit:start'});
            }
        },
        commit() {
            var value;
            if (this.editing && (value = this.$el.innerText) !== this.value) {
                this.$emit('action', {type: 'input', value, old: this.value});
            }
            this.editing = false;
        },
        keyHandler(ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                this.commit();
            }
        }
    }
}
</script>

<style>

</style>