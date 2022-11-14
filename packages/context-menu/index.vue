<template>
    <vue-context-menu ref="m" @click.native="action" @ctx-close="onClose" @ctx-cancel="onClose" :class="theme">
        <slot></slot>
    </vue-context-menu>
</template>

<style src="./context-menu.css"></style>

<script>
import VueContextMenu from 'vue-context-menu';
import Item from './item.vue';

export function contextMenuCleanup() {
    var menu = document.querySelector('.ctx-menu-container');
    if (menu && window.getComputedStyle(menu).display !== 'none')
        document.body.click();
}

export default {
    props: {theme: {default: 'compact'}},
    data: () => ({for: undefined, shown: false}),
    components: {VueContextMenu},
    methods: {
        open(ev, whatFor) {
            contextMenuCleanup();  // close any lingering menu from before
            this.for = whatFor;
            this.shown = true;
            this.$refs.m.open(ev);
            this.$emit('open');
            ev?.preventDefault();  // in case a `contextmenu` event is in progress
        },
        close() {
            this.$refs.m.ctxVisible = false;  // vue-context-menu does not implement 'close'
            this.onClose();
        },
        toggle(ev, whatFor) {
            if (this.shown) this.close();
            else this.open(ev, whatFor);
        },
        action(ev) {
            var item = ev.target.closest('*[name]');
            if (item) {
                var name = item.getAttribute('name');
                this.$emit('action', {type: name, for: this.for});
            }
        },
        onClose() {
            setTimeout(() => this.for = undefined, 0); /** @oops must happen after `action` handler */
            this.shown = false;
            this.$emit('close');
        }
    },
    cleanup: contextMenuCleanup,
    Item
}
</script>