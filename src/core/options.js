
function options(obj, defaults) {
    // wish: recurse on plain-object properties, like in lodash's _.merge
    //  (but not on arrays!)
    //  or use `merge-options`
    return Object.assign({}, defaults, obj);
}

module.exports = options;