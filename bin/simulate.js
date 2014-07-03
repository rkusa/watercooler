#!/usr/bin/env node

Error.stackTraceLimit = Infinity
if (!process.env.DEBUG) process.env.DEBUG = '*'

var docopt = require('docopt').docopt
var doc ="\
Usage: simulate.js.js <port> [--join=<join>] [--id=<id>] [--rate=<rate>]\n\
\n\
Options:\n\
  --id=<id>       The node's id.\n\
  --rate=<rate>   The gossip rate (per minute) [default: 12].\n\
"

var opts = docopt(doc)
// console.log(opts)

var frat = require('../')
var node = new frat.Node({
  id: opts['--id'],
  gossipRate: parseInt(opts['--rate'], 10)
})
var port = opts['<port>']

var blessed = require('blessed')
var screen = blessed.screen()

// Create a box perfectly centered horizontally and vertically.
var box = blessed.box({
  top: 0,
  left: 0,
  width: '100%',
  height: 'shrink',
  content: 'Id: {bold}' + node.id + '{/bold}, Port: {bold}' + port + '{/bold}',
  tags: true,
  style: {
    fg: 'white'
  }
})
screen.append(box)

var progressBar = blessed.progressbar({
  orientation: 'horizontal',
  shrink: true,
  filled: 0,
  left: 0,
  top: 2,
  width: '100%',
  style: {
    bar: {
      bg: 'blue'
    }
  }
})
screen.append(progressBar)

var interval = 60 / parseInt(opts['--rate'], 10) * 1000
var progress = 0
setInterval(function() {
  if (progress === 1000) return
  progressBar.setProgress(++progress)
  screen.render()
}, (interval - 1000) / 100)

var gossip = node.gossip
node.gossip = function() {
  progressBar.setProgress(progress = 0)
  screen.render()
  gossip.apply(node, arguments)
}

var log = blessed.list({
  top: 4,
  left: 0,
  shrink: 'grow',
  tags: true,
  style: {
    fg: 'white'
  },
  mouse: true,
  keys: true,
  vi: true
})
screen.append(log)

var util = require('util')
var debug = require('debug')
var index = 0
debug.log = function() {
  log.add(util.format.apply(util, arguments))
  log.select(index++)
  screen.render()
}

var peerList = blessed.list({
  top: 4,
  right: 0,
  width: 26,
  height: 'shrink',
  tags: true,
  style: {
    fg: 'white'
  },
  border: {
    type: 'line'
  },
  mouse: true,
  keys: true,
  vi: true
})
peerList.prepend(new blessed.Text({
  left: 2,
  content: ' Peers '
}))
screen.append(peerList)

node.on('join', function(peer) {
  peerList.add('[' + peer.address + ']:' + peer.port)
  screen.render()
})

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0)
})

// Render the screen.
screen.render()

node.listen(port, function() {
  if (opts['--join']) {
    node.join(parseInt(opts['--join'], 10), function(err) {
      if (err) throw err
    })
  }
})