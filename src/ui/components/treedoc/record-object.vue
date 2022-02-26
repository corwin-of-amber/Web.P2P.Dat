<template>
    <span class="record" :class="kind" @contextmenu.stop="menu">
        <template v-if="kind === 'text/plain'">
            <record-text :value="object" @action="fwd($event)"/>
        </template>
        <template v-else-if="kind === 'text/automerge' || kind == 'object/FirepadShare'">
            <button @click="select()">Text</button>
        </template>
        <template v-else-if="kind === 'object/FileShare'">
            <button @click="select()">File</button>
        </template>
        <template v-else-if="kind === 'object/VideoIncoming'">
            <p2p.video-view :videoincoming="coerced()"/>
        </template>
        <template v-else-if="kind === 'object'">
            <span class="record--key-value" v-for="(v,k) in object" :key="k"
                    @contextmenu.stop="menu($event, {object, key: k})">
                <record-text :value="k" class="record--key"
                        @action="renameProp($event, {object, key: k})"/><span class="record--key-sep">:</span>
                <record-object :object="v"
                                @action="fwd($event, {object, key: k})"/>
            </span>
        </template>
        <template v-else>{{object}}</template>
    </span>
</template>

<script>
import automerge from 'automerge';

import RecordText from './record-text.vue';


export default {
    name: "record-object",
    props: ['object'],
    computed: {
        kind() {
            var o = this.object;
            // XXX
            if      (typeof o === 'string')            return 'text/plain';
            else if (o instanceof automerge.Text)      return 'text/automerge';
            else if (typeof o === 'object' && o !== null)
                return o.$type ? `object/${o.$type}` : 'object';
            else return 'value';
        },
        objectId() {
            return automerge.getObjectId(this.object);
        }
    },
    methods: {
        select() {
            this.$emit('action', {type: 'select', target: this});
        },
        menu(ev, props) {
            this.$emit('action', {type: 'menu', ...props, target: this, $event: ev});
        },
        renameProp(action, props) {
            switch (action.type) {
            case 'input':
                this.$emit('action', {...props, ...action, type: 'prop-rename'});
                break;
            }
        },
        fwd(action, props=undefined) {
            this.$emit('action', {...props, ...action});
        },
        coerced() {
            switch (this.kind) {
                // XXX bad design
                case 'object/FirepadShare': return FirepadShare.from(this.object);
                case 'object/FileShare': return FileShare.from(this.object);
                case 'object/VideoIncoming': return VideoIncoming.from(this.object);
                default: return this.object;
            }
        }
    },
    components: { RecordText }
}
</script>

<style>

</style>