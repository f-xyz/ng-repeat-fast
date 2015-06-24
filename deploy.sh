#!/usr/bin/env bash

commitMessage=$1
: ${commitMessage:='.'}

gulp clean build

git add --all .
git commit -m "${commitMessage}"
git push -u origin master
git push -u origin gh-pages

#sudo npm publish
