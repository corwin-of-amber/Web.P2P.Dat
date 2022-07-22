<template>
    <span>
        <template v-if="value">
            {{value.downloaded}}/{{value.total}} ({{value.bytes}})
        </template>
    </span>
</template>

<script>
export default { 
    props: ['value']
}
</script>