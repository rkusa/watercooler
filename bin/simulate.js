#!/usr/bin/env node

Error.stackTraceLimit = Infinity
if (!process.env.DEBUG) process.env.DEBUG = '*'

var docopt = require('docopt').docopt
var doc ="\
Usage: simulate.js.js <port> [--join=<join>] [--id=<id>] [--rate=<rate>] [--host=<host>]\n\
\n\
Options:\n\
  --id=<id>       The node's id.\n\
  --rate=<rate>   The gossip rate (per minute) [default: 12].\n\
  --host=<host>   The machines hostname.\n\
"

var opts = docopt(doc)
// console.log(opts)

var watercooler = require('../')
var node = new watercooler.Node({
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
  right: 26,
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
  filled: 0,
  left: 0,
  right: 26,
  top: 1,
  height: 1,
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
node.gossip = function(peer, isResponse) {
  gossip.apply(node, arguments)
  if (isResponse) return
  progressBar.setProgress(progress = 0)
  screen.render()
}

var log = blessed.list({
  top: 2,
  padding: 0,
  left: 0,
  right: 26,
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
  top: 0,
  right: 0,
  width: 26,
  height: '60%',
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
  peerList.add('[' + peer.host + ']:' + peer.port)
  screen.render()
})

var downedList = blessed.list({
  bottom: 0,
  right: 0,
  width: 26,
  height: '40%',
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
downedList.prepend(new blessed.Text({
  left: 2,
  content: ' Down '
}))
screen.append(downedList)

node.on('down', function(peer) {
  var str = '[' + peer.host + ']:' + peer.port
  peerList.removeItem(str)
  downedList.add(str)
  screen.render()
})

node.on('alive', function(peer) {
  var str = '[' + peer.host + ']:' + peer.port
  downedList.removeItem(str)
  peerList.add(str)
  screen.render()
})

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0)
})

// Render the screen.
screen.render()

node.listen(port, opts['--host'], function() {
  if (opts['--join']) {
    node.join(parseInt(opts['--join'], 10), function(err) {
      if (err) throw err
    })
  }
})