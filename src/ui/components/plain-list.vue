<template>
    <ul class="plain-list">
        <li v-for="item,$i in items" :key="$i">
            <slot v-bind:item="item">{{item.toString()}}</slot>
        </li>
    </ul>  
</template>

<script>
export default {
    props: ['items']
}
</script>