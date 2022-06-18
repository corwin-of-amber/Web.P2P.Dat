<template>
    <span></span>
</template>

<script>
/** @todo make this a thin adapter on top of `EventHook` class from `core/events` */
export default {
    props: ['receiver', 'on'],
    mounted() {
        this.$watch('receiver', receiver => {
            this.unregister(); if (receiver) this.register(receiver);
        }, {immediate: true});
    },
    destroyed() { this.unregister(); },
    methods: {
        register(receiver) {
            var handler = stream => this.$emit(this.on, stream);
            receiver.on(this.on, handler);
            this._registered = {receiver, handler};
        },
        unregister() {
            if (this._registered) {
                var {receiver, handler} = this._registered;
                receiver.removeListener(this.on, handler);
            }
        }
    }
}
</script>
