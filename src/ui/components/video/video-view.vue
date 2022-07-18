<template>
    <div class="p2p-video-view">
        <source-video ref="source" :videoincoming="videoincoming"/>
        <video-widget ref="view"/>
    </div>
</template>


<script>
import SourceVideo from './source.vue';
import VideoWidget from './video-widget.vue'

export default {
    props: ['videoincoming'],    
    mounted() {
        this.$refs.view.streams = this.$refs.source.streams;
    },
    components: { SourceVideo, VideoWidget }
}
</script>