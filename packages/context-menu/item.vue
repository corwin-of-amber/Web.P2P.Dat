<template>
    <li :name="name" :class="{disabled: !enabled}"
        @click="$emit('action')"><slot></slot></li>
</template>

<script>
export default {
    props: {'name': {}, 'enabled': {default: true}}
}
</script>