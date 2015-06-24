#!/usr/bin/env bash

spec=$1
: ${spec:='spec'}

mocha --watch test/index.js -R ${spec}
