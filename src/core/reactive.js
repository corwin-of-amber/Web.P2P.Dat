import { EventEmitter } from 'events';


/**
 * For use with reactive views.
 */
class ObservableSet extends Set {
    constructor(...a) { super(...a); this.l = [...this]; }
    add(key) {
        if (!this.has(key)) {
            super.add(key);
            this.l.push(key); this._poke();
        }
    }
    remove(key) {
        super.remove(key);
        var i = this.l.indexOf(key);
        if (i >= 0) { this.l.splice(i, 1); this._poke(); }
    }
    clear() { super.clear(); this.l.splice(0); this._poke(); }

    ev = new EventEmitter();
    observe(h) { this.ev.on('change', h); }
    _poke() { this.ev.emit('change', this); }
}

/**
 * Passes all events in specified list from object `from` through to `to`.
 * @param {EventEmitter} from 
 * @param {string|string[]} events 
 * @param {EventEmitter} to 
 */
function fwd(from, events, to) {
    if (!Array.isArray(events)) events = [events];
    for (let e of events) {
        from.on(e, (...a) => to.emit(e, from, ...a));
    }
}


export { ObservableSet, fwd }