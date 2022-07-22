<template>
    <div class="drawer" :class="open ? 'open' : 'closed'">
        <button @click="toggle()" class="toggle">×</button>
        <slot/>
    </div>
</template>

<script>
export default  {
    data: () => ({ open: false }),
    methods: {
        toggle() { this.open = !this.open; }
    }
}
</script>