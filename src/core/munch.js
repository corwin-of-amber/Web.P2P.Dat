const through2 = require('through2'),
      duplexify = require('duplexify');



function muncher(blockSize) {
    return through2.obj(function (chunk, enc, cb) {
        var i = 0;
        while (i < chunk.length) {
            this.push(chunk.slice(i, i + blockSize));
            i += blockSize;
        }
        cb();
    });
}


/**
 * Chunks the readable side of a duplex stream.
 */
muncher.ofDuplex = function(stream, blockSize) {
    return duplexify(stream, stream.pipe(muncher(blockSize)));
}



module.exports = muncher;