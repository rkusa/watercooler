# watercooler

... is going to be a decentralized solution for cluster membership, failure detection, and service coordination.

[![NPM][npm]](https://npmjs.org/package/watercooler)
[![Dependency Status][dependencies]](https://david-dm.org/rkusa/watercooler)
[![Build Status][travis]](http://travis-ci.org/rkusa/watercooler)

## Usage

```bash
./bin/simulate.js 4001 --id 1 --host=alice --rate 12
./bin/simulate.js 4002 --id 2 --host=alice --join 4001 --rate 12
```

## MIT License

[MIT](LICENSE)

[npm]: http://img.shields.io/npm/v/watercooler.svg?style=flat
[dependencies]: http://img.shields.io/david/rkusa/watercooler.svg?style=flat
[travis]: http://img.shields.io/travis/rkusa/watercooler.svg?style=flat