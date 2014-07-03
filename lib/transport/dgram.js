var dgrams  = require('dgram-stream')
var combine = require('stream-combiner')
var utils   = require('../utils')

exports.createServer = function(port, host, callback) {
  var server = dgrams('udp4')
  server.bind(port)
  callback(null, server)
}

exports.createClient = function(port, host, callback) {
  callback(null, dgrams('udp4'))
}

exports.serialize = function(peer) {
  return combine(
    stringify(),
    truncat(576),
    concat(),
    utils.through({ objectMode: true }, function(obj, enc, cont) {
      this.push({ to: { address: peer.host, port: peer.port }, payload: obj })
      cont()
    })
  )
}

exports.deserialize = function() {
  return combine(
    utils.through({ objectMode: true }, function(obj, enc, cont) {
      this.push(obj.payload)
      cont()
    }),
    parse()
  )
}

function stringify() {
  return utils.through({ objectMode: true }, function(obj, enc, cont) {
    this.push(JSON.stringify(obj) + '\n')
    cont()
  })
}

function parse() {
  return utils.through({ objectMode: true }, function(obj, enc, cont) {
    var self = this
    obj.toString().split(/\n/g).forEach(function(line) {
      if (!line) return
      self.push(JSON.parse(line))
    })
    cont()
  })
}

function truncat(limit) {
  var size = 0, ended = false
  return utils.through({}, function(obj, enc, cont) {
    if (ended) return cont()
    size += obj.length
    if (size > limit) {
      ended = true
      this.end()
    } else {
      this.push(obj)
    }
    cont()
  })
}

function concat() {
  var res = new Buffer(0)
  return utils.through({}, function(obj, enc, cont) {
    res = Buffer.concat([res, obj])
    cont()
  }, function(done) {
    this.push(res)
    done()
  })
}