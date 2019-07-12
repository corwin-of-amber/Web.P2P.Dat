
class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve; this.reject = reject;
        });
    }
    then(cb)  { return this.promise.then(cb); }
    catch(cb) { return this.promise.catch(cb); }
}

function deferred() { return new Deferred(); }
deferred.Deferred = Deferred;



if (typeof module !== 'undefined') {
    module.exports = deferred;
}
