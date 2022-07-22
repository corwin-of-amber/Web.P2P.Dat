import Vue from 'vue';

import 'vue-context/dist/css/vue-context.css';
import './menu.css';

import AppSyncDoc from './components/app-syncdoc.vue';
import AppSyncPad from './components/app-syncpad.vue';


class App {
    constructor(dom, opts={}) {
        let AppComponent = {'doc': AppSyncDoc, 'pad': AppSyncPad}[opts.ui];
        if (!AppComponent) throw new Error(`invalid ui component: '${opts.ui}'`);
        this.vue = new Vue({...AppComponent, 
            propsData: {channel: opts.channel ?? 'lobby'},
        });
        this.vue.$mount();
        dom.append(this.vue.$el);
        this.vue.$on('doc:action', ev => {
            switch (ev.type) {
            case 'select':
                this.vue.$refs.preview.select(ev); break;
            }
        });
    }

    connect() {
        this.vue.$refs.source.connect();
    }

    attach(client) {
        this.vue.client = client;  // non-reactive
        var update = () =>
            this.vue.clientState = { 
                get client() { return client; }
            };
        update(); client.on('init', update);
        return this;
    }
}

App.start = function (opts={}) {
    window.app = new App(opts.root || document.body, opts);
    window.addEventListener('beforeunload', () => { window.app = null; });
    return window.app;
}



if (typeof module !== 'undefined') {
    module.exports = {App};
}