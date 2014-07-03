var afd = require('afd')

var Peer = module.exports = function(id, port, host) {
  this.id   = id
  this.port = port
  this.host = host

  this.afd  = afd()
}

Peer.prototype = Object.create({

  get phi() {
    return this.afd.phi()
  },

  report: function() {
    this.afd.report()
  }

}, { constructor: Peer })