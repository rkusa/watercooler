'use strict'

var shortid = require('shortid')
var plasmid = require('plasmid')
var EventEmitter = require('events').EventEmitter
var utils = require('./utils')
var debug = require('debug')

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
  this.gossiper.use(require('plasmid-events')({
    received: gossip,
    emitted:  gossip,
    emitter:  this
  }))

  this.gossiper.on('update', function(obj) {
    if (obj.k[0] !== '~') return
    debug.gossip('%d: received %s=%s (for %s)', self.id, obj.k[1], obj.v, obj.r)
  })

  this.peers = []
  this.on('join', function(peer) {
    self.peers.push(peer)
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
 * @property {String} [address] own hostname or IP address
 * @property {String|Number} [id] this node's id (must be unique within the cluster)
 * @property {Number} gossipRate=6 how often gossip per second
 */

/**
 * Bind the node to the provided port/host.
 *
 * @param {Number} port
 * @param {String} [hostname]
 * @param {Function} [callback]
 */
Node.prototype.listen = function(/*port, hostname, callback*/) {
  var args = Array.prototype.slice.call(arguments)
  var port = args.shift(), callback = args.pop()
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

  this.debug.node('listening on [%s]:%d', this.address, this.port)

  this.gossiper.event('join', {
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

/**
 * Start gossiping.
 *
 * @param {Object} [peer]
 * @param {Boolean} [isRepsonse]
 */
Node.prototype.gossip = function(peer, isResponse) {
  if (!peer) {
    if (!this.peers.length) {
      this.debug.gossip('no peers')
      return
    }

    peer = this.peers[randomBetween(0, this.peers.length - 1)]
  }

  this.debug.gossip(
    (isResponse ? 'respond to' : 'gossip with') + ' %s (on [%s]:%d)',
    peer.id, peer.address, peer.port
  )

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

var retry = require('retry')

/**
 * Try to join the cluster by contacting the node at the provided port/host.
 *
 * @param {Number} port
 * @param {String} [hostname]
 * @param {Function} [callback]
 */
Node.prototype.join = function() {
  // handle arguments
  var args = Array.prototype.slice.call(arguments)
  var port = args.shift(), callback = args.pop()
  var hostname = args.shift()
  if (typeof callback !== 'function') {
    hostname = callback
    callback = undefined
  }

  if (port < 1 || port > 65535) {
    throw new TypeError('Port should be > 0 and < 65536')
  }

  this.debug.node('joining [%s]:%d', hostname, port)

  // initialize retry operation
  var retries = 3, timeout = 10000
  var operation = retry.operation({
    retries: retries,
    minTimeout: timeout
  })

  var self = this
  function done() { // success method
    operation.retry() // indicate success
    self.debug.node('joining [%s]:%d - succeeded', hostname, port)
  }

  operation.attempt(function() {
    // try to gossip with the targeted node
    self.gossip({ port: port, address: hostname })

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
        self.debug.node('joining [%s]:%d timed out - retry', hostname, port)
        self.removeListener('join', done)
      }
    }
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