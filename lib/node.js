'use strict'

var debug = require('debug')('frat')
var shortid = require('shortid')
var plasmid = require('plasmid')
var EventEmitter = require('events').EventEmitter
var utils  = require('./utils')

/**
 * Node
 *
 * @constructor
 * @param {Number} port
 * @param {NodeOptions} [opts]
 */
var Node = module.exports = function(opts) {
  this.opts  = opts || {}
  this.id    = this.opts.id === undefined ? shortid.generate() : this.opts.id
  this.debug = require('debug')('frat:' + this.id)

  this.gossiper = new plasmid.Host(this.id)
  this.interval = 60 / parseInt(this.opts.gossipRate || 6, 10) * 1000

  this.transport = this.opts.transport || require('./transport/dgram')

  var self = this
  this.gossiper.on('update', function(obj) {
    self.debug('received %s=%s (for %s)', obj.k, obj.v, obj.r)

    var parts = obj.k.split(':')
    if (parts.length < 2 || parts[0] !== 'frat') {
      return
    }
    self.emit(parts[1], obj.v)
  })

  EventEmitter.call(this)

  this.peers = []
  this.on('join', function(peer) {
    self.peers.push(peer)
  })

  setInterval(function() {
    self.gossip()
  }, this.interval)
}

Node.prototype = Object.create(EventEmitter.prototype, {
  constructor: Node
})

/**
 * @typedef NodeOptions
 * @type {Object}
 * @property {String} [address] own hostname or IP address
 * @property {String|Number} [id] this node's id (must be unique within the cluster)
 * @property {Number} gossipRate=6 how often gossip per second
 */

Node.prototype.listen = function(/*port, hostname, callback*/) {
  var args = Array.prototype.slice.call(arguments)
  var port = parseInt(args.shift(), 10), callback = args.pop()
  var hostname = args.shift()
  if (typeof callback !== 'function') {
    hostname = callback
    callback = undefined
  }

  if (port < 1 || port > 65535) {
    throw new TypeError('Port should be > 0 and < 65536')
  }

  this.port     = port
  this.address  = hostname || require('os').hostname()

  debug('starting %s on [%s]:%d', this.id, this.address, this.port)

  this.gossiper.set('frat:join', {
    id:      this.id,
    address: this.address,
    port:    this.port
  })

  var self = this
  this.transport.createServer(this.port, this.address, function(err, server) {
    if (err) throw err
    self.server = server

    self.server.on('data', function(data) {
      var exchange = self.gossiper.exchange()

      createReadableFrom(data)
      .pipe(self.transport.deserialize())
      .pipe(utils.through({ objectMode: true }, function(obj, enc, cont) {
        if ('from' in obj) {
          setImmediate(function() {
            self.gossip({ port: obj.from.port, address: obj.from.address }, true)
          })
          cont()
        } else {
          this.push(obj)
          cont()
        }
      }))

      .pipe(exchange)

      .pipe(self.transport.serialize({
        port: data.from.port,
        address: data.from.address
      }))
      .pipe(utils.through({ objectMode: true }, function(obj, enc, cont) {
        self.server.write(obj)
        cont()
      }))
    })

    if (callback) {
      setImmediate(callback)
    }
  })
}

Node.prototype.gossip = function(peer, isResponse) {
  if (!peer) {
    if (!this.peers.length) {
      this.debug('no peers')
      return
    }

    peer = this.peers[randomBetween(0, this.peers.length - 1)]
  }

  this.debug((isResponse ? 'respond to' : 'gossip with') + ' %s (on [%s]:%d)',
             peer.id, peer.address, peer.port)

  var self = this
  this.transport.createClient(this.port, this.address, function(err, client) {
    if (err) throw err

    var hs = self.gossiper.createStream()
    if (!isResponse) {
      hs.push({ from: { id: self.id, port: self.port, address: self.address } })
    }

    hs.pipe(self.transport.serialize(peer))
      .pipe(client, { end: false })

    client.pipe(self.transport.deserialize(peer))
          .pipe(hs)

    client.pipe(utils.through({ objectMode: true }, function(obj, enc, cont) {
      this.end()
      cont()
    }))
  })
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

var stream = require('stream')
function createReadableFrom(obj) {
  var r = new stream.Readable({ objectMode: true })
  r._read = function() {}
  r.push(obj)
  return r
}