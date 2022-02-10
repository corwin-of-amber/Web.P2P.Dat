import { lazily } from '../core/memo';


const config = lazily(function() {
    var ls = localStorage['ronin#ui'];
    if (!ls) return {};
    try {
        return JSON.parse(ls);
    }
    catch (e) { console.warn('in `ronin#ui` config:', e); }
});


export default config;