var dgrams  = require('dgram-stream')
var combine = require('stream-combiner')
var utils   = require('../utils')

exports.createServer = function(port, host, callback) {
  var server = dgrams('udp4')
  server.bind(port, host, function() {
    callback(null, server)
  })
}

exports.createClient = function(port, host, callback) {
  callback(null, dgrams('udp4'))
}

exports.serialize = function(peer) {
  return combine(
    stringify(peer),
    truncat(576),
    concat(),
    utils.through({ objectMode: true }, function(obj, enc, cont) {
      // TODO: fix peer.address || peer.host
      this.push({ to: { address: peer.address || peer.host, port: peer.port }, payload: obj })
      cont()
    })
  )
}

exports.deserialize = function(peer) {
  return combine(
    utils.through({ objectMode: true }, function(obj, enc, cont) {
      this.push(obj.payload)
      cont()
    }),
    parse(peer)
  )
}

function stringify(peer) {
  return utils.through({ objectMode: true }, function(obj, enc, cont) {
    try {
      this.push(JSON.stringify(obj) + '\n')
    } catch (err) {
      console.error(err, peer)
      // console.log(this)
    }
    cont()
  })
}

function parse(peer) {
  return utils.through({ objectMode: true }, function(obj, enc, cont) {
    var self = this
    obj.toString().split(/\n/g).forEach(function(line) {
      if (!line) return
      var delta = JSON.parse(line)
      if (peer) {
        delta.from = peer.id
      }
      self.push(delta)
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