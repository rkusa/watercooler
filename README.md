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

Copyright (c) 2014 Markus Ast

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

[npm]: http://img.shields.io/npm/v/watercooler.svg?style=flat
[dependencies]: http://img.shields.io/david/rkusa/watercooler.svg?style=flat
[travis]: http://img.shields.io/travis/rkusa/watercooler.svg?style=flat