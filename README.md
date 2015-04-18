# fast-repeat
[![Build Status](https://travis-ci.org/fantasticMrFox/ng-repeat-fast.svg?branch=master)](https://travis-ci.org/fantasticMrFox/ng-repeat-fast)

*Fast-repeat* is a much faster implementation of *Angular directive* `ng-repeat`.
Was build with performance in mind (only).

* Caches DOM nodes.
* Works much faster than `ng-repeat`.
* Does not support objects (use array models only).
* Add `$$hashKey` field into every model's item.
    * Ignored by `angular.toJson()`.
* Old unused nodes collection. - planned
* Animations. - planned
* `track by` expressions. - planned
* ...
    
    
## Basic Usage
```
<div class="list-item" fast-repeat="item in list | filter: search">
    {{ item.value }}
 </div>
```

## Render just once
```
<div class="list-item" fast-repeat="item in ::list">
    {{ item.value }}
 </div>
```

## With `ng-include`
```
<div class="list-item"
     fast-repeat="item in list | filter: search"
     ng-include="'item-template'">
</div>
```
