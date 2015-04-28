# fast-repeat v.0.1.24
[![Build Status](https://travis-ci.org/fantasticMrFox/ng-repeat-fast.svg?branch=master)](https://travis-ci.org/fantasticMrFox/ng-repeat-fast)

Fast-repeat is a faster implementation 
of Angular directive `ng-repeat`.
Was build with performance in mind (to be honest, only).

* Uses [list-diff](https://github.com/fantasticMrFox/list-diff) for list comparison.
* Caches DOM nodes.
* Works much faster than `ng-repeat`.
* Supports *arrays of objects* only. So:
    * no arrays of primitive values.
    * no objects as model.
* Does not create comment nodes.
* Does not support ng-repeat-start & ng-repeat-end.
* Does not support ng-include on the repeated element.
    * Use nested `<div ng-include='...'></div>`. Make it automatic?
* `track by` - supported.
    * `track by $index` adds $$hashKey field into every item.
* Animations. - *planned*
    
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
