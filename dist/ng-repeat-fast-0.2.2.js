(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.ngRepeatFast = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var DIFF_NOT_MODIFIED = 0;
var DIFF_CREATED = 1;
var DIFF_MOVED = 2;
var DIFF_DELETED = -1;

var lastUniqueId = 0;

/**
 * Returns auto incremental unique ID as integer.
 * @returns {number} integers starting from 0
 */
function getUniqueId() {
    return lastUniqueId++;
}

/**
 * Returns x if it is not undefined, y otherwise.
 * @param x
 * @param y
 * @returns {*}
 */
function maybe(x, y) {
    if (x !== undefined) return x;
    return y;
}

/**
 * @param {Array} list
 * @param {string} primaryKey
 * @returns {{}}
 */
function buildHashToIndexMap(list, primaryKey) {
    var map = {};
    for (var i = 0; i < list.length; ++i) {
        var item = list[i];
        map[item[primaryKey]] = i;
    }
    return map;
}

/**
 * Calculates difference between two arrays.
 * Returns array of { item: T, state: int }.
 * Where state means: 0 - not modified, 1 - created, -1 - deleted.
 * @param {Array} newList
 * @param {Array} oldList
 * @param {string} primaryKey item's unique index field name
 */
function diff(newList, oldList, primaryKey) {
    var diff = [];
    var newIndex = 0;
    var oldIndex = 0;

    var newIndexMap = buildHashToIndexMap(newList, primaryKey);
    var oldIndexMap = buildHashToIndexMap(oldList, primaryKey);

    function addEntry(item, state, newIndex, prevIndex) {
        diff.push({
            item: item,
            state: state,
            oldIndex: prevIndex,
            newIndex: newIndex
        });
    }

    for (; newIndex < newList.length || oldIndex < oldList.length;) {
        var newItem = newList[newIndex];
        var oldItem = oldList[oldIndex];

        if (newIndex >= newList.length) {

            addEntry(oldItem, DIFF_DELETED, -1, oldIndex);
            ++oldIndex;

        } else if (oldIndex >= oldList.length) {

            addEntry(newItem, DIFF_CREATED, newIndex, -1);
            ++newIndex;

        } else if (newItem !== oldItem) {

            var indexOfNewItemInOldList =
                maybe(oldIndexMap[newItem[primaryKey]], -1);

            var indexOfOldItemInNewList =
                maybe(newIndexMap[oldItem[primaryKey]], -1);

            var isCreated = indexOfNewItemInOldList === -1;
            var isDeleted = indexOfOldItemInNewList === -1;

            // created
            if (isCreated) {
                addEntry(newItem, DIFF_CREATED, newIndex, -1);
                ++newIndex;
            }

            // moved
            if (!isCreated && !isDeleted) {
                addEntry(newItem, DIFF_MOVED, newIndex, indexOfOldItemInNewList);
                ++newIndex;
                ++oldIndex;
            }

            // deleted
            if (isDeleted) {
                addEntry(oldItem, DIFF_DELETED, -1, oldIndex);
                ++oldIndex;
            }

        } else {
            addEntry(oldItem, DIFF_NOT_MODIFIED, newIndex, oldIndex);
            ++newIndex;
            ++oldIndex;
        }
    }

    return diff;
}

// exports ////////////////////////////////////////////////////////////////

diff.NOT_MODIFIED = DIFF_NOT_MODIFIED;
diff.CREATED = DIFF_CREATED;
diff.MOVED = DIFF_MOVED;
diff.DELETED = DIFF_DELETED;
diff.getUniqueId = getUniqueId;
diff.buildHashToIndexMap = buildHashToIndexMap;

module.exports = diff;

},{}],2:[function(require,module,exports){
(function (factory) {
    /* istanbul ignore next */
    if (typeof require == 'function') {
        var diff = require('f-xyz-diff');
        factory(module.exports, diff);
    } else {
        factory(window, window.diff);
    }
})(function (exports, diff) {
    'use strict';

    ///////////////////////////////////////////////////////////////////////////

    exports.ngRepeatFast = angular
        .module('ngRepeatFast', [])
        .directive('ngRepeatFast', function ($parse, $compile) {
            return {
                scope: true,
                restrict: 'A',
                priority: 1000,
                terminal: true,
                link: function ($scope, $element, $attrs) {
                    ngRepeatFastLink($scope, $element, $attrs, $parse, $compile);
                }
            };
        });

    ///////////////////////////////////////////////////////////////////////////

    function ngRepeatFastLink($scope, $element, $attrs, $parse, $compile) {

        // todo - animations support
        // todo - garbage collection for DOM nodes (?) timer-based?

        var HASH_KEY = '$$hashKey';

        if ('ngInclude' in $attrs) {
            throw Error('ngRepeatFast: ngInclude on repeating ' +
                        'element is not supported. ' +
                        'Please create nested element with ng-include.');
        }

        // parse ng-repeat expression /////////////////////////////////////////

        var rx = /^\s*(\w+)\sin\s(.+?)(\strack by\s(.+?))?$/;
        var match = $attrs.ngRepeatFast.match(rx);
        if (!match) {
            throw Error('ngRepeatFast: expected ngRepeatFast in form of ' +
                        '`{item} in {array} [| filter, etc]` [track by \'{field}\'] ' +
                        'but got `' + $attrs.ngRepeatFast + '`');
        }

        var iteratorName = match[1];
        var expression = match[2];
        var trackBy = match[4] || HASH_KEY;
        var model = getModel();
        if (!Array.isArray(model)) {
            throw Error('ngRepeatFast: expected model `' + $attrs.ngRepeatFast + '` ' +
                        'to be an array but got: ' + model);
        }

        // build DOM //////////////////////////////////////////////////////////

        var itemHashToNodeMap = {};

        var elementNode = $element[0];
        var elementParentNode = elementNode.parentNode;
        var elementNodeIndex = getNodeIndex(elementNode, true);
        var templateNode = elementNode.cloneNode(true);
        templateNode.removeAttribute('ng-repeat-fast');

        var prevNode = elementNode;
        model.forEach(function (item) {
            var node = createNode(item);
            insertAfter(node, prevNode);
            prevNode = node;
            // store node
            if (trackBy === HASH_KEY) {
                item[trackBy] = diff.getUniqueId();
            }
            itemHashToNodeMap[item[trackBy]] = node;
        });
        hideNode(elementNode);

        // watch model for changes if it is not one-time binding
        var unwatchModel;
        if (!/^::/.test(expression)) {
            unwatchModel = $scope.$watchCollection(getModel, renderChanges);
        }

        ///////////////////////////////////////////////////////////////////

        function getModel() {
            return $parse(expression)($scope);
        }

        function renderChanges(list, prev) {
            if (list === prev) return;

            var difference = diff(list, prev, trackBy);

            syncDom(difference);
        }

        function syncDom(difference) {
            var prevNode = elementNode; // insert new node after me
            difference.forEach(function (diffEntry, i) {
                var item = diffEntry.item;
                var node = itemHashToNodeMap[item[trackBy]];
                var nodeIndex;

                switch (diffEntry.state) {

                    case diff.CREATED:
                        if (node) {
                            nodeIndex = getNodeIndex(node);
                            if (nodeIndex != i) {
                                insertAfter(node, prevNode);
                            }
                            showNode(node);
                        } else {
                            node = createNode(item);
                            insertAfter(node, prevNode);
                            var hashKey = diff.getUniqueId();
                            item[trackBy] = hashKey;
                            itemHashToNodeMap[hashKey] = node;
                        }
                        break;

                    case diff.MOVED:
                    case diff.NOT_MODIFIED:
                        nodeIndex = getNodeIndex(node);
                        if (nodeIndex != i) {
                            insertAfter(node, prevNode);
                        }
                        break;

                    case diff.DELETED:
                        hideNode(node);
                        //deleteNode(node);
                        //delete itemHashToNodeMap[item[trackBy]];
                        break;
                }
                prevNode = node;
            });
        }

        // DOM operations /////////////////////////////////////////////////

        function insertAfter(node, afterNode) {
            if (afterNode.nextSibling) {
                elementParentNode.insertBefore(node, afterNode.nextSibling);
            } else {
                elementParentNode.appendChild(node);
            }
        }

        function createNode(item) {
            var scope = $scope.$new();
            scope[iteratorName] = item;

            var node = templateNode.cloneNode(true);

            amendItemScope(scope, node);
            $compile(node)(scope);

            return node;
        }

        function amendItemScope(scope, node) {
            Object.defineProperties(scope, {
                $index: {
                    enumerable: true,
                    get: function () {
                        return getNodeIndex(node);
                    }
                },
                $first: {
                    enumerable: true,
                    get: function () {
                        return getNodeIndex(node) === 0;
                    }
                },
                $last: {
                    enumerable: true,
                    get: function () {
                        var length = getModel().length;
                        return getNodeIndex(node) === length-1;
                    }
                },
                $middle: {
                    enumerable: true,
                    get: function () {
                        return !this.$first && !this.$last;
                    }
                },
                $even: {
                    enumerable: true,
                    get: function () {
                        return this.$index % 2 === 0;
                    }
                },
                $odd: {
                    enumerable: true,
                    get: function () {
                        return this.$index % 2 === 1;
                    }
                }
            });
            return scope;
        }

        function showNode(node) {
            node.className = node.className.slice(0, -8);
        }

        function hideNode(node) {
            node.className += ' ng-hide';
        }

        function getNodeIndex(node, absolute) {
            var nodeList = elementParentNode.childNodes;
            var index = [].indexOf.call(nodeList, node);
            if (!absolute) {
                index = index - elementNodeIndex - 1;
            }
            return index;
        }

        ///////////////////////////////////////////////////////////////////////////

        $scope.$on('$destroy', function () {
            unwatchModel();
        });
    }

});

},{"f-xyz-diff":1}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZi14eXotZGlmZi9pbmRleC5qcyIsInNyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgRElGRl9OT1RfTU9ESUZJRUQgPSAwO1xudmFyIERJRkZfQ1JFQVRFRCA9IDE7XG52YXIgRElGRl9NT1ZFRCA9IDI7XG52YXIgRElGRl9ERUxFVEVEID0gLTE7XG5cbnZhciBsYXN0VW5pcXVlSWQgPSAwO1xuXG4vKipcbiAqIFJldHVybnMgYXV0byBpbmNyZW1lbnRhbCB1bmlxdWUgSUQgYXMgaW50ZWdlci5cbiAqIEByZXR1cm5zIHtudW1iZXJ9IGludGVnZXJzIHN0YXJ0aW5nIGZyb20gMFxuICovXG5mdW5jdGlvbiBnZXRVbmlxdWVJZCgpIHtcbiAgICByZXR1cm4gbGFzdFVuaXF1ZUlkKys7XG59XG5cbi8qKlxuICogUmV0dXJucyB4IGlmIGl0IGlzIG5vdCB1bmRlZmluZWQsIHkgb3RoZXJ3aXNlLlxuICogQHBhcmFtIHhcbiAqIEBwYXJhbSB5XG4gKiBAcmV0dXJucyB7Kn1cbiAqL1xuZnVuY3Rpb24gbWF5YmUoeCwgeSkge1xuICAgIGlmICh4ICE9PSB1bmRlZmluZWQpIHJldHVybiB4O1xuICAgIHJldHVybiB5O1xufVxuXG4vKipcbiAqIEBwYXJhbSB7QXJyYXl9IGxpc3RcbiAqIEBwYXJhbSB7c3RyaW5nfSBwcmltYXJ5S2V5XG4gKiBAcmV0dXJucyB7e319XG4gKi9cbmZ1bmN0aW9uIGJ1aWxkSGFzaFRvSW5kZXhNYXAobGlzdCwgcHJpbWFyeUtleSkge1xuICAgIHZhciBtYXAgPSB7fTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyArK2kpIHtcbiAgICAgICAgdmFyIGl0ZW0gPSBsaXN0W2ldO1xuICAgICAgICBtYXBbaXRlbVtwcmltYXJ5S2V5XV0gPSBpO1xuICAgIH1cbiAgICByZXR1cm4gbWFwO1xufVxuXG4vKipcbiAqIENhbGN1bGF0ZXMgZGlmZmVyZW5jZSBiZXR3ZWVuIHR3byBhcnJheXMuXG4gKiBSZXR1cm5zIGFycmF5IG9mIHsgaXRlbTogVCwgc3RhdGU6IGludCB9LlxuICogV2hlcmUgc3RhdGUgbWVhbnM6IDAgLSBub3QgbW9kaWZpZWQsIDEgLSBjcmVhdGVkLCAtMSAtIGRlbGV0ZWQuXG4gKiBAcGFyYW0ge0FycmF5fSBuZXdMaXN0XG4gKiBAcGFyYW0ge0FycmF5fSBvbGRMaXN0XG4gKiBAcGFyYW0ge3N0cmluZ30gcHJpbWFyeUtleSBpdGVtJ3MgdW5pcXVlIGluZGV4IGZpZWxkIG5hbWVcbiAqL1xuZnVuY3Rpb24gZGlmZihuZXdMaXN0LCBvbGRMaXN0LCBwcmltYXJ5S2V5KSB7XG4gICAgdmFyIGRpZmYgPSBbXTtcbiAgICB2YXIgbmV3SW5kZXggPSAwO1xuICAgIHZhciBvbGRJbmRleCA9IDA7XG5cbiAgICB2YXIgbmV3SW5kZXhNYXAgPSBidWlsZEhhc2hUb0luZGV4TWFwKG5ld0xpc3QsIHByaW1hcnlLZXkpO1xuICAgIHZhciBvbGRJbmRleE1hcCA9IGJ1aWxkSGFzaFRvSW5kZXhNYXAob2xkTGlzdCwgcHJpbWFyeUtleSk7XG5cbiAgICBmdW5jdGlvbiBhZGRFbnRyeShpdGVtLCBzdGF0ZSwgbmV3SW5kZXgsIHByZXZJbmRleCkge1xuICAgICAgICBkaWZmLnB1c2goe1xuICAgICAgICAgICAgaXRlbTogaXRlbSxcbiAgICAgICAgICAgIHN0YXRlOiBzdGF0ZSxcbiAgICAgICAgICAgIG9sZEluZGV4OiBwcmV2SW5kZXgsXG4gICAgICAgICAgICBuZXdJbmRleDogbmV3SW5kZXhcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZm9yICg7IG5ld0luZGV4IDwgbmV3TGlzdC5sZW5ndGggfHwgb2xkSW5kZXggPCBvbGRMaXN0Lmxlbmd0aDspIHtcbiAgICAgICAgdmFyIG5ld0l0ZW0gPSBuZXdMaXN0W25ld0luZGV4XTtcbiAgICAgICAgdmFyIG9sZEl0ZW0gPSBvbGRMaXN0W29sZEluZGV4XTtcblxuICAgICAgICBpZiAobmV3SW5kZXggPj0gbmV3TGlzdC5sZW5ndGgpIHtcblxuICAgICAgICAgICAgYWRkRW50cnkob2xkSXRlbSwgRElGRl9ERUxFVEVELCAtMSwgb2xkSW5kZXgpO1xuICAgICAgICAgICAgKytvbGRJbmRleDtcblxuICAgICAgICB9IGVsc2UgaWYgKG9sZEluZGV4ID49IG9sZExpc3QubGVuZ3RoKSB7XG5cbiAgICAgICAgICAgIGFkZEVudHJ5KG5ld0l0ZW0sIERJRkZfQ1JFQVRFRCwgbmV3SW5kZXgsIC0xKTtcbiAgICAgICAgICAgICsrbmV3SW5kZXg7XG5cbiAgICAgICAgfSBlbHNlIGlmIChuZXdJdGVtICE9PSBvbGRJdGVtKSB7XG5cbiAgICAgICAgICAgIHZhciBpbmRleE9mTmV3SXRlbUluT2xkTGlzdCA9XG4gICAgICAgICAgICAgICAgbWF5YmUob2xkSW5kZXhNYXBbbmV3SXRlbVtwcmltYXJ5S2V5XV0sIC0xKTtcblxuICAgICAgICAgICAgdmFyIGluZGV4T2ZPbGRJdGVtSW5OZXdMaXN0ID1cbiAgICAgICAgICAgICAgICBtYXliZShuZXdJbmRleE1hcFtvbGRJdGVtW3ByaW1hcnlLZXldXSwgLTEpO1xuXG4gICAgICAgICAgICB2YXIgaXNDcmVhdGVkID0gaW5kZXhPZk5ld0l0ZW1Jbk9sZExpc3QgPT09IC0xO1xuICAgICAgICAgICAgdmFyIGlzRGVsZXRlZCA9IGluZGV4T2ZPbGRJdGVtSW5OZXdMaXN0ID09PSAtMTtcblxuICAgICAgICAgICAgLy8gY3JlYXRlZFxuICAgICAgICAgICAgaWYgKGlzQ3JlYXRlZCkge1xuICAgICAgICAgICAgICAgIGFkZEVudHJ5KG5ld0l0ZW0sIERJRkZfQ1JFQVRFRCwgbmV3SW5kZXgsIC0xKTtcbiAgICAgICAgICAgICAgICArK25ld0luZGV4O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBtb3ZlZFxuICAgICAgICAgICAgaWYgKCFpc0NyZWF0ZWQgJiYgIWlzRGVsZXRlZCkge1xuICAgICAgICAgICAgICAgIGFkZEVudHJ5KG5ld0l0ZW0sIERJRkZfTU9WRUQsIG5ld0luZGV4LCBpbmRleE9mT2xkSXRlbUluTmV3TGlzdCk7XG4gICAgICAgICAgICAgICAgKytuZXdJbmRleDtcbiAgICAgICAgICAgICAgICArK29sZEluZGV4O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBkZWxldGVkXG4gICAgICAgICAgICBpZiAoaXNEZWxldGVkKSB7XG4gICAgICAgICAgICAgICAgYWRkRW50cnkob2xkSXRlbSwgRElGRl9ERUxFVEVELCAtMSwgb2xkSW5kZXgpO1xuICAgICAgICAgICAgICAgICsrb2xkSW5kZXg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGFkZEVudHJ5KG9sZEl0ZW0sIERJRkZfTk9UX01PRElGSUVELCBuZXdJbmRleCwgb2xkSW5kZXgpO1xuICAgICAgICAgICAgKytuZXdJbmRleDtcbiAgICAgICAgICAgICsrb2xkSW5kZXg7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGlmZjtcbn1cblxuLy8gZXhwb3J0cyAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbmRpZmYuTk9UX01PRElGSUVEID0gRElGRl9OT1RfTU9ESUZJRUQ7XG5kaWZmLkNSRUFURUQgPSBESUZGX0NSRUFURUQ7XG5kaWZmLk1PVkVEID0gRElGRl9NT1ZFRDtcbmRpZmYuREVMRVRFRCA9IERJRkZfREVMRVRFRDtcbmRpZmYuZ2V0VW5pcXVlSWQgPSBnZXRVbmlxdWVJZDtcbmRpZmYuYnVpbGRIYXNoVG9JbmRleE1hcCA9IGJ1aWxkSGFzaFRvSW5kZXhNYXA7XG5cbm1vZHVsZS5leHBvcnRzID0gZGlmZjtcbiIsIihmdW5jdGlvbiAoZmFjdG9yeSkge1xuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKHR5cGVvZiByZXF1aXJlID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIGRpZmYgPSByZXF1aXJlKCdmLXh5ei1kaWZmJyk7XG4gICAgICAgIGZhY3RvcnkobW9kdWxlLmV4cG9ydHMsIGRpZmYpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGZhY3Rvcnkod2luZG93LCB3aW5kb3cuZGlmZik7XG4gICAgfVxufSkoZnVuY3Rpb24gKGV4cG9ydHMsIGRpZmYpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgIGV4cG9ydHMubmdSZXBlYXRGYXN0ID0gYW5ndWxhclxuICAgICAgICAubW9kdWxlKCduZ1JlcGVhdEZhc3QnLCBbXSlcbiAgICAgICAgLmRpcmVjdGl2ZSgnbmdSZXBlYXRGYXN0JywgZnVuY3Rpb24gKCRwYXJzZSwgJGNvbXBpbGUpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgc2NvcGU6IHRydWUsXG4gICAgICAgICAgICAgICAgcmVzdHJpY3Q6ICdBJyxcbiAgICAgICAgICAgICAgICBwcmlvcml0eTogMTAwMCxcbiAgICAgICAgICAgICAgICB0ZXJtaW5hbDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBsaW5rOiBmdW5jdGlvbiAoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHJzKSB7XG4gICAgICAgICAgICAgICAgICAgIG5nUmVwZWF0RmFzdExpbmsoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHJzLCAkcGFyc2UsICRjb21waWxlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgZnVuY3Rpb24gbmdSZXBlYXRGYXN0TGluaygkc2NvcGUsICRlbGVtZW50LCAkYXR0cnMsICRwYXJzZSwgJGNvbXBpbGUpIHtcblxuICAgICAgICAvLyB0b2RvIC0gYW5pbWF0aW9ucyBzdXBwb3J0XG4gICAgICAgIC8vIHRvZG8gLSBnYXJiYWdlIGNvbGxlY3Rpb24gZm9yIERPTSBub2RlcyAoPykgdGltZXItYmFzZWQ/XG5cbiAgICAgICAgdmFyIEhBU0hfS0VZID0gJyQkaGFzaEtleSc7XG5cbiAgICAgICAgaWYgKCduZ0luY2x1ZGUnIGluICRhdHRycykge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ25nUmVwZWF0RmFzdDogbmdJbmNsdWRlIG9uIHJlcGVhdGluZyAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdlbGVtZW50IGlzIG5vdCBzdXBwb3J0ZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ1BsZWFzZSBjcmVhdGUgbmVzdGVkIGVsZW1lbnQgd2l0aCBuZy1pbmNsdWRlLicpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcGFyc2UgbmctcmVwZWF0IGV4cHJlc3Npb24gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgICAgICB2YXIgcnggPSAvXlxccyooXFx3KylcXHNpblxccyguKz8pKFxcc3RyYWNrIGJ5XFxzKC4rPykpPyQvO1xuICAgICAgICB2YXIgbWF0Y2ggPSAkYXR0cnMubmdSZXBlYXRGYXN0Lm1hdGNoKHJ4KTtcbiAgICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ25nUmVwZWF0RmFzdDogZXhwZWN0ZWQgbmdSZXBlYXRGYXN0IGluIGZvcm0gb2YgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnYHtpdGVtfSBpbiB7YXJyYXl9IFt8IGZpbHRlciwgZXRjXWAgW3RyYWNrIGJ5IFxcJ3tmaWVsZH1cXCddICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2J1dCBnb3QgYCcgKyAkYXR0cnMubmdSZXBlYXRGYXN0ICsgJ2AnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpdGVyYXRvck5hbWUgPSBtYXRjaFsxXTtcbiAgICAgICAgdmFyIGV4cHJlc3Npb24gPSBtYXRjaFsyXTtcbiAgICAgICAgdmFyIHRyYWNrQnkgPSBtYXRjaFs0XSB8fCBIQVNIX0tFWTtcbiAgICAgICAgdmFyIG1vZGVsID0gZ2V0TW9kZWwoKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG1vZGVsKSkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ25nUmVwZWF0RmFzdDogZXhwZWN0ZWQgbW9kZWwgYCcgKyAkYXR0cnMubmdSZXBlYXRGYXN0ICsgJ2AgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAndG8gYmUgYW4gYXJyYXkgYnV0IGdvdDogJyArIG1vZGVsKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGJ1aWxkIERPTSAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICAgICAgdmFyIGl0ZW1IYXNoVG9Ob2RlTWFwID0ge307XG5cbiAgICAgICAgdmFyIGVsZW1lbnROb2RlID0gJGVsZW1lbnRbMF07XG4gICAgICAgIHZhciBlbGVtZW50UGFyZW50Tm9kZSA9IGVsZW1lbnROb2RlLnBhcmVudE5vZGU7XG4gICAgICAgIHZhciBlbGVtZW50Tm9kZUluZGV4ID0gZ2V0Tm9kZUluZGV4KGVsZW1lbnROb2RlLCB0cnVlKTtcbiAgICAgICAgdmFyIHRlbXBsYXRlTm9kZSA9IGVsZW1lbnROb2RlLmNsb25lTm9kZSh0cnVlKTtcbiAgICAgICAgdGVtcGxhdGVOb2RlLnJlbW92ZUF0dHJpYnV0ZSgnbmctcmVwZWF0LWZhc3QnKTtcblxuICAgICAgICB2YXIgcHJldk5vZGUgPSBlbGVtZW50Tm9kZTtcbiAgICAgICAgbW9kZWwuZm9yRWFjaChmdW5jdGlvbiAoaXRlbSkge1xuICAgICAgICAgICAgdmFyIG5vZGUgPSBjcmVhdGVOb2RlKGl0ZW0pO1xuICAgICAgICAgICAgaW5zZXJ0QWZ0ZXIobm9kZSwgcHJldk5vZGUpO1xuICAgICAgICAgICAgcHJldk5vZGUgPSBub2RlO1xuICAgICAgICAgICAgLy8gc3RvcmUgbm9kZVxuICAgICAgICAgICAgaWYgKHRyYWNrQnkgPT09IEhBU0hfS0VZKSB7XG4gICAgICAgICAgICAgICAgaXRlbVt0cmFja0J5XSA9IGRpZmYuZ2V0VW5pcXVlSWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGl0ZW1IYXNoVG9Ob2RlTWFwW2l0ZW1bdHJhY2tCeV1dID0gbm9kZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGhpZGVOb2RlKGVsZW1lbnROb2RlKTtcblxuICAgICAgICAvLyB3YXRjaCBtb2RlbCBmb3IgY2hhbmdlcyBpZiBpdCBpcyBub3Qgb25lLXRpbWUgYmluZGluZ1xuICAgICAgICB2YXIgdW53YXRjaE1vZGVsO1xuICAgICAgICBpZiAoIS9eOjovLnRlc3QoZXhwcmVzc2lvbikpIHtcbiAgICAgICAgICAgIHVud2F0Y2hNb2RlbCA9ICRzY29wZS4kd2F0Y2hDb2xsZWN0aW9uKGdldE1vZGVsLCByZW5kZXJDaGFuZ2VzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgICAgICBmdW5jdGlvbiBnZXRNb2RlbCgpIHtcbiAgICAgICAgICAgIHJldHVybiAkcGFyc2UoZXhwcmVzc2lvbikoJHNjb3BlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHJlbmRlckNoYW5nZXMobGlzdCwgcHJldikge1xuICAgICAgICAgICAgaWYgKGxpc3QgPT09IHByZXYpIHJldHVybjtcblxuICAgICAgICAgICAgdmFyIGRpZmZlcmVuY2UgPSBkaWZmKGxpc3QsIHByZXYsIHRyYWNrQnkpO1xuXG4gICAgICAgICAgICBzeW5jRG9tKGRpZmZlcmVuY2UpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc3luY0RvbShkaWZmZXJlbmNlKSB7XG4gICAgICAgICAgICB2YXIgcHJldk5vZGUgPSBlbGVtZW50Tm9kZTsgLy8gaW5zZXJ0IG5ldyBub2RlIGFmdGVyIG1lXG4gICAgICAgICAgICBkaWZmZXJlbmNlLmZvckVhY2goZnVuY3Rpb24gKGRpZmZFbnRyeSwgaSkge1xuICAgICAgICAgICAgICAgIHZhciBpdGVtID0gZGlmZkVudHJ5Lml0ZW07XG4gICAgICAgICAgICAgICAgdmFyIG5vZGUgPSBpdGVtSGFzaFRvTm9kZU1hcFtpdGVtW3RyYWNrQnldXTtcbiAgICAgICAgICAgICAgICB2YXIgbm9kZUluZGV4O1xuXG4gICAgICAgICAgICAgICAgc3dpdGNoIChkaWZmRW50cnkuc3RhdGUpIHtcblxuICAgICAgICAgICAgICAgICAgICBjYXNlIGRpZmYuQ1JFQVRFRDpcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub2RlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUluZGV4ID0gZ2V0Tm9kZUluZGV4KG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub2RlSW5kZXggIT0gaSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNlcnRBZnRlcihub2RlLCBwcmV2Tm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNob3dOb2RlKG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBub2RlID0gY3JlYXRlTm9kZShpdGVtKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnNlcnRBZnRlcihub2RlLCBwcmV2Tm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGhhc2hLZXkgPSBkaWZmLmdldFVuaXF1ZUlkKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbVt0cmFja0J5XSA9IGhhc2hLZXk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbUhhc2hUb05vZGVNYXBbaGFzaEtleV0gPSBub2RlO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBkaWZmLk1PVkVEOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIGRpZmYuTk9UX01PRElGSUVEOlxuICAgICAgICAgICAgICAgICAgICAgICAgbm9kZUluZGV4ID0gZ2V0Tm9kZUluZGV4KG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGVJbmRleCAhPSBpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zZXJ0QWZ0ZXIobm9kZSwgcHJldk5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBkaWZmLkRFTEVURUQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBoaWRlTm9kZShub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vZGVsZXRlTm9kZShub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vZGVsZXRlIGl0ZW1IYXNoVG9Ob2RlTWFwW2l0ZW1bdHJhY2tCeV1dO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHByZXZOb2RlID0gbm9kZTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRE9NIG9wZXJhdGlvbnMgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgICAgIGZ1bmN0aW9uIGluc2VydEFmdGVyKG5vZGUsIGFmdGVyTm9kZSkge1xuICAgICAgICAgICAgaWYgKGFmdGVyTm9kZS5uZXh0U2libGluZykge1xuICAgICAgICAgICAgICAgIGVsZW1lbnRQYXJlbnROb2RlLmluc2VydEJlZm9yZShub2RlLCBhZnRlck5vZGUubmV4dFNpYmxpbmcpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50UGFyZW50Tm9kZS5hcHBlbmRDaGlsZChub2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGNyZWF0ZU5vZGUoaXRlbSkge1xuICAgICAgICAgICAgdmFyIHNjb3BlID0gJHNjb3BlLiRuZXcoKTtcbiAgICAgICAgICAgIHNjb3BlW2l0ZXJhdG9yTmFtZV0gPSBpdGVtO1xuXG4gICAgICAgICAgICB2YXIgbm9kZSA9IHRlbXBsYXRlTm9kZS5jbG9uZU5vZGUodHJ1ZSk7XG5cbiAgICAgICAgICAgIGFtZW5kSXRlbVNjb3BlKHNjb3BlLCBub2RlKTtcbiAgICAgICAgICAgICRjb21waWxlKG5vZGUpKHNjb3BlKTtcblxuICAgICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBhbWVuZEl0ZW1TY29wZShzY29wZSwgbm9kZSkge1xuICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnRpZXMoc2NvcGUsIHtcbiAgICAgICAgICAgICAgICAkaW5kZXg6IHtcbiAgICAgICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Tm9kZUluZGV4KG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAkZmlyc3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Tm9kZUluZGV4KG5vZGUpID09PSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAkbGFzdDoge1xuICAgICAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsZW5ndGggPSBnZXRNb2RlbCgpLmxlbmd0aDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBnZXROb2RlSW5kZXgobm9kZSkgPT09IGxlbmd0aC0xO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAkbWlkZGxlOiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuICF0aGlzLiRmaXJzdCAmJiAhdGhpcy4kbGFzdDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJGV2ZW46IHtcbiAgICAgICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy4kaW5kZXggJSAyID09PSAwO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAkb2RkOiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJGluZGV4ICUgMiA9PT0gMTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHNjb3BlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gc2hvd05vZGUobm9kZSkge1xuICAgICAgICAgICAgbm9kZS5jbGFzc05hbWUgPSBub2RlLmNsYXNzTmFtZS5zbGljZSgwLCAtOCk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBoaWRlTm9kZShub2RlKSB7XG4gICAgICAgICAgICBub2RlLmNsYXNzTmFtZSArPSAnIG5nLWhpZGUnO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0Tm9kZUluZGV4KG5vZGUsIGFic29sdXRlKSB7XG4gICAgICAgICAgICB2YXIgbm9kZUxpc3QgPSBlbGVtZW50UGFyZW50Tm9kZS5jaGlsZE5vZGVzO1xuICAgICAgICAgICAgdmFyIGluZGV4ID0gW10uaW5kZXhPZi5jYWxsKG5vZGVMaXN0LCBub2RlKTtcbiAgICAgICAgICAgIGlmICghYWJzb2x1dGUpIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IGluZGV4IC0gZWxlbWVudE5vZGVJbmRleCAtIDE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaW5kZXg7XG4gICAgICAgIH1cblxuICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgICAgICAkc2NvcGUuJG9uKCckZGVzdHJveScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHVud2F0Y2hNb2RlbCgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbn0pO1xuIl19
