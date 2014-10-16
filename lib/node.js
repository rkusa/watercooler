'use strict'

var shortid = require('shortid')
var plasmid = require('plasmid')
var EventEmitter = require('events').EventEmitter
var utils = require('./utils')
var debug = require('debug')

var Peer = require('./peer')

/**
 * A Node of the cluster.
 *
 * @constructor
 * @param {Number} port
 * @param {NodeOptions} [opts]
 */
var Node = module.exports = function(opts) {
  this.opts  = opts || {}
  this.id    = this.opts.id === undefined ? shortid.generate() : this.opts.id

  this.interval = 60 / parseInt(this.opts.gossipRate || 6, 10) * 1000

  this.transport = this.opts.transport || require('./transport/dgram')

  EventEmitter.call(this)

  var self = this
  this.gossiper = new plasmid.Host(this.id)
  function gossip() {
    setImmediate(function() {
      self.gossip()
    })
  }
  this.gossiper.use(require('plasmid-heartbeat')({
    interval: 1000
  }))
  this.gossiper.use(require('plasmid-events')({
    received: gossip,
    emitted:  gossip,
    emitter:  this
  }))

  this.gossiper.on('update', function(obj) {
    self.report(obj.r)
    switch (obj.k[0]) {
      case '❤':
        self.debug.gossip('❤ for %s', obj.r)
        break
      case '~':
        self.debug.gossip('received %s=%s (for %s)', obj.k[1], obj.v, obj.r)
        break
    }
  })

  this.peers  = Object.create(null)
  this.downed = Object.create(null)

  this.on('join', function(peer) {
    self.peers[peer.id] = new Peer(peer.id, peer.port, peer.host)
  })

  setInterval(function() {
    self.gossip()
  }, this.interval)

  this.debug = {
    node:   debug('watercooler:node:' + this.id),
    gossip: debug('watercooler:gossip:' + this.id)
  }

}

Node.prototype = Object.create(EventEmitter.prototype, {
  constructor: Node
})

/**
 * @typedef NodeOptions
 * @type {Object}
 * @property {String|Number} [id] this node's id (must be unique within the cluster)
 * @property {Number} gossipRate=6 how often gossip per second
 */

/**
 * Bind the node to the provided port/host.
 *
 * @param {Number} port
 * @param {String} [host]
 * @param {Function} [callback]
 */
Node.prototype.listen = function() {
  var args = Array.prototype.slice.call(arguments)
  var port = args.shift(), callback = args.pop()
  var host = args.shift()
  if (typeof callback !== 'function') {
    host = callback
    callback = undefined
  }

  if (port < 1 || port > 65535) {
    throw new TypeError('Port should be > 0 and < 65536')
  }

  this.port = port
  this.host = host || require('os').hostname()

  this.debug.node('listening on [%s]:%d', this.host, this.port)

  this.gossiper.event('join', {
    id:   this.id,
    host: this.host,
    port: this.port
  })

  var self = this
  this.transport.createServer(this.port, this.host, function(err, server) {
    if (err) throw err
    self.server = server

    self.server.on('data', function(data) {
      var exchange = self.gossiper.exchange()

      createReadableFrom(data)
      .pipe(self.transport.deserialize())
      .pipe(utils.through({ objectMode: true }, function(obj, enc, cont) {
        if ('from' in obj) {
          self.report(obj.from.id)
          setImmediate(function() {
            self.gossip(obj.from, true)
          })
          cont()
        } else {
          this.push(obj)
          cont()
        }
      }))

      .pipe(exchange)

      .pipe(self.transport.serialize(data.from))
      .pipe(utils.through({ objectMode: true }, function(obj, enc, cont) {
        self.server.write(obj)
        cont()
      }))
    })

    if (callback) {
      setImmediate(callback.bind(self))
    }
  })
}

/**
 * Start gossiping.
 *
 * @param {Object} [peer]
 * @param {Boolean} [isRepsonse]
 */
Node.prototype.gossip = function(peer, isResponse) {
  if (!peer) {
    var ids = Object.keys(this.peers)
    if (!ids.length) {
      this.debug.gossip('no peers')
      return
    }

    var id = ids[randomBetween(0, ids.length - 1)]
    peer = this.peers[id]
  }

  var phi = Math.round(peer.phi * 100) / 100
  if (phi > 8) {
    this.debug.node('peer %s seems to be down (phi: %d)', peer.id, phi)
    this.emit('down', peer)
    this.downed[peer.id] = this.peers[peer.id]
    delete this.peers[peer.id]
  }


  if ((this.id == 1 && peer.id == 3) || (this.id == 3 && peer.id == 1)) {
    this.debug.gossip('intercepted %s (phi: %d)', peer.id, Math.round(peer.phi * 100) / 100)
    return
  }

  this.debug.gossip(
    (isResponse ? 'respond to' : 'gossip with') + ' %s on [%s]:%d (phi: %d)',
    peer.id, peer.host, peer.port, Math.round(peer.phi * 100) / 100
  )

  var self = this
  this.transport.createClient(this.port, this.host, function(err, client) {
    if (err) throw err

    var hs = self.gossiper.createStream()
    if (!isResponse) {
      hs.push({ from: { id: self.id, port: self.port, host: self.host } })
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

var retry = require('retry')

/**
 * Try to join the cluster by contacting the node at the provided port/host.
 *
 * @param {Number} port
 * @param {String} [host]
 * @param {Function} [callback]
 */
Node.prototype.join = function() {
  // handle arguments
  var args = Array.prototype.slice.call(arguments)
  var port = args.shift(), callback = args.pop()
  var host = args.shift()
  if (typeof callback !== 'function') {
    host = callback
    callback = undefined
  }

  if (port < 1 || port > 65535) {
    throw new TypeError('Port should be > 0 and < 65536')
  }

  this.debug.node('joining [%s]:%d', host, port)

  // initialize retry operation
  var retries = 3, timeout = 10000
  var operation = retry.operation({
    retries: retries,
    minTimeout: timeout
  })

  var self = this
  function done() { // success method
    operation.retry() // indicate success
    self.debug.node('joining [%s]:%d - succeeded', host, port)
  }

  operation.attempt(function() {
    // try to gossip with the targeted node
    self.gossip({ port: port, host: host })

    // `join` event, i.e., joining the cluster succeeded
    self.once('join', done)
  }, {
    timeout: timeout,
    cb: function() {
      if (--retries === 0) {
        // throw if there are no retries left
        if (callback) callback(operation.mainError())
      } else {
        // retry operation
        operation.retry(new Error('Joining failed - target node not available'))
        self.debug.node('joining [%s]:%d timed out - retry', host, port)
        self.removeListener('join', done)
      }
    }
  })
}

Node.prototype.report = function(id) {
  if (id in this.downed) {
    var peer = this.downed[id]
    this.peers[id] = peer
    delete this.downed[id]

    this.emit('alive', peer)
    this.debug.node('peer %s seems to be alive again', peer.id)
  }

  if (id in this.peers) {
    this.peers[id].report()
  }
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