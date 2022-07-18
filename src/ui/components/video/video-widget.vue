<template>
    <div class="video-widget">
        <template v-for="stream in streams">
            <video-stream :stream="stream"/>
        </template>
    </div>
</template>

<script>
import VideoStream from './video-stream.vue';

export default {
    data: () => ({ streams: [] }),
    components: { VideoStream }
}
</script>