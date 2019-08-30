const node_require = global.require || (() => {}), /* bypass browserify */
      fs = node_require('fs'),
      {EventEmitter} = require('events'),
      _ = require('lodash');



class FileWatcher extends EventEmitter {

    constructor() {
        super();
        this.watches = [];
        if (typeof window !== 'undefined')
            window.addEventListener('unload', () => this.clear());
  
        this._debounceHandler = _.debounce((ev, fn) => this.handler(ev, fn), 500);
    }

    add(filename) {
        filename = filename.replace(/^file:\/\//, '');
        this.watches.push(
            fs.watch(filename, {persistent: false}, this._debounceHandler));
        return this;
    }

    clear() {
        for (let w of this.watches) w.close();
        this.watches = [];
    }

    single(filename) {
        this.clear(); this.add(filename);
        return this;
    }

    handler(ev, filename) {
        this.emit('change', {filename});
    }

}



module.exports = {FileWatcher};