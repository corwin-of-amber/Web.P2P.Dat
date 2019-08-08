const through2 = require('through2');



function muncher(block_size) {
    return through2(function (chunk, enc, cb) {
        var i = 0;
        while (i < chunk.length) {
            this.push(chunk.slice(i, i + block_size));
            i += block_size;
        }
        cb();
    });
}



module.exports = muncher;