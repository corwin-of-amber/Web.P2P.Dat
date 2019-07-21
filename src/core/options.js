
function options(obj, defaults) {
    return Object.assign(Object.assign({}, defaults), obj || {});
}

module.exports = options;