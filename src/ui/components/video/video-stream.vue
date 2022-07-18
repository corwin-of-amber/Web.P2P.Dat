<template>
    <div> -- {{stream}} --</div>
</template>

<script>
import { VideoIncoming } from '../../../addons/video';

/* this component is here solely for being able to intercept `mounted`. */
/* otherwise it could well have been inlined in `video-widget.vue`. */
export default {
    props: ['stream'],
    mounted() {
        this.$watch('stream', (stream) => {
            this.$el.innerHTML = '';
            if (stream instanceof MediaStream) {
                this.$el.append(VideoIncoming.createVideoElement(stream));
            }
        }, {immediate: true});
    }
}
</script>