<template>
    <div :class="{'menu-open': !!menuOpen}">
        <plain-list :items="docs" v-slot="{item}">
            <record-object :object="item"
                            @action="onAction(item, $event)"/>
        </plain-list>
        <div><button :disabled="!editable" @click="create">+</button></div>
        <hook :receiver="sync" on="change" @change="update"/>
        <document-context-menu ref="menu" :for="menuOpen"
            @action="menuAction" @close="menuClose"/>
    </div>
</template>

<script>
import assert from 'assert';
import cuid from 'cuid';

import config from '../../config';
import PlainList from '../plain-list.vue';
import EventHook from '../event-hook.vue';
import RecordObject from './record-object.vue';
import DocumentContextMenu from './document-context-menu.vue';
import * as syncpad from '../../../addons/syncpad';


export default {
    props: ['editable'],
    data: () => ({ docs: [], sync: undefined, menuOpen: undefined }),
    mounted() {
        this.$root.$watch('clientState', (state) => {
            if (state) this.sync = state.client.sync;
        }, {immediate: true});
    },
    methods: {
        create() { this.sync.create(this._freshId()); },
        update({id, doc}) { this.setDoc(id, doc); },
        setDoc(id, doc) {
            var idx = this.docs.findIndex(d => d.id == id);
            if (idx >= 0)
                this.docs.splice(idx, 1, {id, doc});
            else
                this.docs.push({id, doc});
        },
        onAction(item, action) {
            var {o, t, slot} = this._locate(item, action);
            switch (action.type) {
            case 'input':
                o.path(action.key).set(action.value);
                break;
            case 'menu':
                action.$event.preventDefault();
                Object.assign(this.menuOpen = {}, {item, ...action});
                // ^ fields of `menuOpen` should be non-reactive
                this.$refs.menu.open(action.$event);
                break;
            case 'prop-create':
                (t || o).change(d => d[this._freshKey(d)] = '');
                break;
            case 'prop-delete':
                o.change(d => delete d[action.key]);
                break;
            case 'prop-rename':
                assert(action.value !== action.old);
                o.change(d => {
                    d[action.value] = d[action.old];
                    delete d[action.old];  // changes order :(
                });
                break;
            case 'elem-create':
                (t || o).change(d => d.push(''));
                break;
            case 'elem-delete':
                o.change(d => d.splice(action.key, 1));
                break;
            case 'make-object':
                if (slot) slot.set({});
                break;
            case 'make-array':
                if (slot) slot.set([]);
                break;
            case 'make-syncpad':
                if (slot)
                    slot.set(syncpad.FirepadShare.fromText(slot.get().toString()));
                break;         // ^ XXX
            case 'make-videoout':
                if (slot) {
                    slot.set({});
                    (async() => {
                        var v = await video.VideoOutgoing.acquire({audio: false});
                        v.embed(this.$root.clientState.client, slot);
                        window.v = v;
                    })();
                }
                break;
            case 'dev-globalvar':
                if (slot) { console.log("temp:", slot); window.temp = slot; }
                break;
            }
            this.$emit('doc:action', {docId: item.id, doc: item.doc, ...action});
        },
        menuAction(action) {
            if (this.menuOpen)
                this.onAction(this.menuOpen.item, {...this.menuOpen, ...action});
        },
        menuClose() {
            this.menuOpen = undefined;
            window.getSelection().collapseToStart();  // prevent sporadic mark of text
        },
        _freshId() {
            if (config().idscheme === 'toy') return `${this.docs.length + 1}`;
            return cuid();
        },
        _freshKey(obj) {
            for (let i = 0;; i++) {
                let k = `key${i}`;
                if (!obj.hasOwnProperty(k)) return k;
            }
        },
        _locate(item, action) {
            var o = action.object, t = action.target, key = action.key;
            if (o === item) {
                return {t: this.sync.path(item.id)};
            }
            else {
                o = o && this.sync.object(item.id, o);
                t = t && t.kind === 'object' && this.sync.object(item.id, t.object);
                return {o, t, slot: o && key && o.path(key)};
            }
        }
    },
    components: {
        PlainList,
        RecordObject,
        DocumentContextMenu,
        hook: EventHook
    }
}
</script>
