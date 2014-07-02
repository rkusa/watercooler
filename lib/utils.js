'use strict'

var stream = require('stream')
exports.through = function(opts, transform, flush) {
  var t = new stream.Transform(opts)
  t._transform = transform
  if (flush) t._flush = flush
  return t
}

exports.cat = function() {
  return exports.through({ objectMode: true }, function(obj, enc, cont) {
    console.log('CAT', obj)
    this.push(obj)
    cont()
  })
}