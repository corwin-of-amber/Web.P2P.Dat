const {FeedClient} = require('./src/net/client');



var c1 = new FeedClient();
var c2 = new FeedClient();





if (typeof process !== 'undefined' && process.versions.nw)
    global.console = window.console;  // for debugging in nwjs

if (typeof window !== 'undefined') {
    if (typeof App === 'undefined') {
        Object.assign(window, require('./src/ui/ui'));
    }
    window.addEventListener('beforeunload', () => {
        c1.close(); c2.close();
    });
    Object.assign(window, {c1, c2});
}
else
    c1.join('lobby', false); // listen only
