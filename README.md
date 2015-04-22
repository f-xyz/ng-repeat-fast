# fast-repeat v.0.1.0-alpha
[![Build Status](https://travis-ci.org/fantasticMrFox/ng-repeat-fast.svg?branch=master)](https://travis-ci.org/fantasticMrFox/ng-repeat-fast)

Fast-repeat is a much faster implementation 
of Angular directive `ng-repeat`.
Was build with performance in mind (to be honest - only).

* Caches DOM nodes (and eats more memory).
* Works much faster than `ng-repeat`.
* Supports *arrays of objects* only.
    * Don't use arrays of primitive values.
    * Don't use objects as model.
* Adds `$$hashKey` field into every model's item.
    * However `$$hashKey` is ignored by `angular.toJson()`.
* Does not create comment nodes.
* Does not support ng-repeat-start & ng-repeat-end.
* Does not support ng-include.
    * Workaround: use inner `<div ng-include='...'></div>`.
        * Make it automatic?
* Animations. - *planned*
* `track by` expressions. - *planned*
* ...
    
## Basic Usage
```html
<div class="list-item" fast-repeat="item in list | filter: search">
    {{ item.value }}
</div>
```

## Render just once

Works with one-time binding syntax.

```html
<div class="list-item" fast-repeat="item in ::list">
    {{ ::item.value }}
</div>
```

## With `ng-include`
```html
<div class="list-item" fast-repeat="item in list | filter: search">
     <div ng-include="'item-template.html'"></div>
</div>
```

## License
MIT
