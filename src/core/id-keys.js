
function hex(b /* Buffer */) {
    return b && b.toString('hex');
}

function hexShort(b /* Buffer */) {
    return b && hex(b).slice(0,7);
}


/* abstract */
class KeyedMap extends Map {
    get(key)        { return super.get(this.realKey(key)); }
    set(key, value) { return super.set(this.realKey(key), value); }
    delete(key)     { return super.delete(this.realkey(key)); }
    has(key)        { return super.has(this.realKey(key)); }
    realkey(key)    { return key; }
}

class HexKeyedMap extends KeyedMap {
    realKey(key) { return hex(key); }
}


export { hex, hexShort, KeyedMap, HexKeyedMap }