(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.fastRepeat = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
    if (typeof require == 'function') {
        var diff = require('f-xyz-diff');
        factory(module.exports, diff);
    } else {
        factory(window, window.diff);
    }
})(function fastRepeatMain(exports, diff) {
    'use strict';

    ///////////////////////////////////////////////////////////////////////////

    exports.fastRepeat = angular
        .module('fastRepeat', [])
        .directive('fastRepeat', function ($parse, $compile) {
            return {
                scope: true,
                restrict: 'A',
                priority: 1000,
                terminal: true,
                link: function ($scope, $element, $attrs) {
                    fastRepeatLink($scope, $element, $attrs, $parse, $compile);
                }
            };
        });

    ///////////////////////////////////////////////////////////////////////////

    /**
     * @param $scope
     * @param $element
     * @param $parse
     * @param $compile
     * @param {{ fastRepeat: string }} $attrs
     */
    function fastRepeatLink($scope, $element, $attrs, $parse, $compile) {
        // todo - directive: dont-evaluate-if-out-screen
        // todo - animation support
        // todo - garbage collection for DOM nodes (?) timer-based?

        var HASH_KEY = '$$hashKey';

        if ('ngInclude' in $attrs) {
            throw Error('fastRepeat: ngInclude on repeated ' +
                        'element is not supported. ' +
                        'Please create inner element with ng-include.');
        }

        // parse ng-repeat expression /////////////////////////////////////////

        var rx = /^\s*(\w+)\sin\s(.+?)(\strack by\s(.+?))?$/;
        var match = $attrs.fastRepeat.match(rx);
        if (!match) {
            throw Error('fastRepeat: expected fastRepeat in form of ' +
                        '`{item} in {array} [| filter, etc]` [track by \'{field}\'] ' +
                        'but got `' + $attrs.fastRepeat + '`');
        }

        var iteratorName = match[1];
        var expression = match[2];
        var trackBy = match[4] || HASH_KEY;
        var model = getModel();
        if (!Array.isArray(model)) {
            throw Error('fastRepeat: expected model `' + $attrs.fastRepeat + '` ' +
                        'to be an array but got: ' + String(model));
        }

        // build DOM //////////////////////////////////////////////////////////

        var itemHashToNodeMap = {};

        var elementNode = $element[0];
        var elementParentNode = elementNode.parentNode;
        var elementNodeIndex = getNodeIndex(elementNode, true);
        var templateNode = elementNode.cloneNode(true);
        templateNode.removeAttribute('fast-repeat');

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

        // watch model for changes if
        // it is not one-time binding
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZi14eXotZGlmZi9pbmRleC5qcyIsInNyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBESUZGX05PVF9NT0RJRklFRCA9IDA7XG52YXIgRElGRl9DUkVBVEVEID0gMTtcbnZhciBESUZGX01PVkVEID0gMjtcbnZhciBESUZGX0RFTEVURUQgPSAtMTtcblxudmFyIGxhc3RVbmlxdWVJZCA9IDA7XG5cbi8qKlxuICogUmV0dXJucyBhdXRvIGluY3JlbWVudGFsIHVuaXF1ZSBJRCBhcyBpbnRlZ2VyLlxuICogQHJldHVybnMge251bWJlcn0gaW50ZWdlcnMgc3RhcnRpbmcgZnJvbSAwXG4gKi9cbmZ1bmN0aW9uIGdldFVuaXF1ZUlkKCkge1xuICAgIHJldHVybiBsYXN0VW5pcXVlSWQrKztcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHggaWYgaXQgaXMgbm90IHVuZGVmaW5lZCwgeSBvdGhlcndpc2UuXG4gKiBAcGFyYW0geFxuICogQHBhcmFtIHlcbiAqIEByZXR1cm5zIHsqfVxuICovXG5mdW5jdGlvbiBtYXliZSh4LCB5KSB7XG4gICAgaWYgKHggIT09IHVuZGVmaW5lZCkgcmV0dXJuIHg7XG4gICAgcmV0dXJuIHk7XG59XG5cbi8qKlxuICogQHBhcmFtIHtBcnJheX0gbGlzdFxuICogQHBhcmFtIHtzdHJpbmd9IHByaW1hcnlLZXlcbiAqIEByZXR1cm5zIHt7fX1cbiAqL1xuZnVuY3Rpb24gYnVpbGRIYXNoVG9JbmRleE1hcChsaXN0LCBwcmltYXJ5S2V5KSB7XG4gICAgdmFyIG1hcCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgaXRlbSA9IGxpc3RbaV07XG4gICAgICAgIG1hcFtpdGVtW3ByaW1hcnlLZXldXSA9IGk7XG4gICAgfVxuICAgIHJldHVybiBtYXA7XG59XG5cbi8qKlxuICogQ2FsY3VsYXRlcyBkaWZmZXJlbmNlIGJldHdlZW4gdHdvIGFycmF5cy5cbiAqIFJldHVybnMgYXJyYXkgb2YgeyBpdGVtOiBULCBzdGF0ZTogaW50IH0uXG4gKiBXaGVyZSBzdGF0ZSBtZWFuczogMCAtIG5vdCBtb2RpZmllZCwgMSAtIGNyZWF0ZWQsIC0xIC0gZGVsZXRlZC5cbiAqIEBwYXJhbSB7QXJyYXl9IG5ld0xpc3RcbiAqIEBwYXJhbSB7QXJyYXl9IG9sZExpc3RcbiAqIEBwYXJhbSB7c3RyaW5nfSBwcmltYXJ5S2V5IGl0ZW0ncyB1bmlxdWUgaW5kZXggZmllbGQgbmFtZVxuICovXG5mdW5jdGlvbiBkaWZmKG5ld0xpc3QsIG9sZExpc3QsIHByaW1hcnlLZXkpIHtcbiAgICB2YXIgZGlmZiA9IFtdO1xuICAgIHZhciBuZXdJbmRleCA9IDA7XG4gICAgdmFyIG9sZEluZGV4ID0gMDtcblxuICAgIHZhciBuZXdJbmRleE1hcCA9IGJ1aWxkSGFzaFRvSW5kZXhNYXAobmV3TGlzdCwgcHJpbWFyeUtleSk7XG4gICAgdmFyIG9sZEluZGV4TWFwID0gYnVpbGRIYXNoVG9JbmRleE1hcChvbGRMaXN0LCBwcmltYXJ5S2V5KTtcblxuICAgIGZ1bmN0aW9uIGFkZEVudHJ5KGl0ZW0sIHN0YXRlLCBuZXdJbmRleCwgcHJldkluZGV4KSB7XG4gICAgICAgIGRpZmYucHVzaCh7XG4gICAgICAgICAgICBpdGVtOiBpdGVtLFxuICAgICAgICAgICAgc3RhdGU6IHN0YXRlLFxuICAgICAgICAgICAgb2xkSW5kZXg6IHByZXZJbmRleCxcbiAgICAgICAgICAgIG5ld0luZGV4OiBuZXdJbmRleFxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBmb3IgKDsgbmV3SW5kZXggPCBuZXdMaXN0Lmxlbmd0aCB8fCBvbGRJbmRleCA8IG9sZExpc3QubGVuZ3RoOykge1xuICAgICAgICB2YXIgbmV3SXRlbSA9IG5ld0xpc3RbbmV3SW5kZXhdO1xuICAgICAgICB2YXIgb2xkSXRlbSA9IG9sZExpc3Rbb2xkSW5kZXhdO1xuXG4gICAgICAgIGlmIChuZXdJbmRleCA+PSBuZXdMaXN0Lmxlbmd0aCkge1xuXG4gICAgICAgICAgICBhZGRFbnRyeShvbGRJdGVtLCBESUZGX0RFTEVURUQsIC0xLCBvbGRJbmRleCk7XG4gICAgICAgICAgICArK29sZEluZGV4O1xuXG4gICAgICAgIH0gZWxzZSBpZiAob2xkSW5kZXggPj0gb2xkTGlzdC5sZW5ndGgpIHtcblxuICAgICAgICAgICAgYWRkRW50cnkobmV3SXRlbSwgRElGRl9DUkVBVEVELCBuZXdJbmRleCwgLTEpO1xuICAgICAgICAgICAgKytuZXdJbmRleDtcblxuICAgICAgICB9IGVsc2UgaWYgKG5ld0l0ZW0gIT09IG9sZEl0ZW0pIHtcblxuICAgICAgICAgICAgdmFyIGluZGV4T2ZOZXdJdGVtSW5PbGRMaXN0ID1cbiAgICAgICAgICAgICAgICBtYXliZShvbGRJbmRleE1hcFtuZXdJdGVtW3ByaW1hcnlLZXldXSwgLTEpO1xuXG4gICAgICAgICAgICB2YXIgaW5kZXhPZk9sZEl0ZW1Jbk5ld0xpc3QgPVxuICAgICAgICAgICAgICAgIG1heWJlKG5ld0luZGV4TWFwW29sZEl0ZW1bcHJpbWFyeUtleV1dLCAtMSk7XG5cbiAgICAgICAgICAgIHZhciBpc0NyZWF0ZWQgPSBpbmRleE9mTmV3SXRlbUluT2xkTGlzdCA9PT0gLTE7XG4gICAgICAgICAgICB2YXIgaXNEZWxldGVkID0gaW5kZXhPZk9sZEl0ZW1Jbk5ld0xpc3QgPT09IC0xO1xuXG4gICAgICAgICAgICAvLyBjcmVhdGVkXG4gICAgICAgICAgICBpZiAoaXNDcmVhdGVkKSB7XG4gICAgICAgICAgICAgICAgYWRkRW50cnkobmV3SXRlbSwgRElGRl9DUkVBVEVELCBuZXdJbmRleCwgLTEpO1xuICAgICAgICAgICAgICAgICsrbmV3SW5kZXg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIG1vdmVkXG4gICAgICAgICAgICBpZiAoIWlzQ3JlYXRlZCAmJiAhaXNEZWxldGVkKSB7XG4gICAgICAgICAgICAgICAgYWRkRW50cnkobmV3SXRlbSwgRElGRl9NT1ZFRCwgbmV3SW5kZXgsIGluZGV4T2ZPbGRJdGVtSW5OZXdMaXN0KTtcbiAgICAgICAgICAgICAgICArK25ld0luZGV4O1xuICAgICAgICAgICAgICAgICsrb2xkSW5kZXg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGRlbGV0ZWRcbiAgICAgICAgICAgIGlmIChpc0RlbGV0ZWQpIHtcbiAgICAgICAgICAgICAgICBhZGRFbnRyeShvbGRJdGVtLCBESUZGX0RFTEVURUQsIC0xLCBvbGRJbmRleCk7XG4gICAgICAgICAgICAgICAgKytvbGRJbmRleDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgYWRkRW50cnkob2xkSXRlbSwgRElGRl9OT1RfTU9ESUZJRUQsIG5ld0luZGV4LCBvbGRJbmRleCk7XG4gICAgICAgICAgICArK25ld0luZGV4O1xuICAgICAgICAgICAgKytvbGRJbmRleDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkaWZmO1xufVxuXG4vLyBleHBvcnRzIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuZGlmZi5OT1RfTU9ESUZJRUQgPSBESUZGX05PVF9NT0RJRklFRDtcbmRpZmYuQ1JFQVRFRCA9IERJRkZfQ1JFQVRFRDtcbmRpZmYuTU9WRUQgPSBESUZGX01PVkVEO1xuZGlmZi5ERUxFVEVEID0gRElGRl9ERUxFVEVEO1xuZGlmZi5nZXRVbmlxdWVJZCA9IGdldFVuaXF1ZUlkO1xuZGlmZi5idWlsZEhhc2hUb0luZGV4TWFwID0gYnVpbGRIYXNoVG9JbmRleE1hcDtcblxubW9kdWxlLmV4cG9ydHMgPSBkaWZmO1xuIiwiKGZ1bmN0aW9uIChmYWN0b3J5KSB7XG4gICAgaWYgKHR5cGVvZiByZXF1aXJlID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFyIGRpZmYgPSByZXF1aXJlKCdmLXh5ei1kaWZmJyk7XG4gICAgICAgIGZhY3RvcnkobW9kdWxlLmV4cG9ydHMsIGRpZmYpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGZhY3Rvcnkod2luZG93LCB3aW5kb3cuZGlmZik7XG4gICAgfVxufSkoZnVuY3Rpb24gZmFzdFJlcGVhdE1haW4oZXhwb3J0cywgZGlmZikge1xuICAgICd1c2Ugc3RyaWN0JztcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgZXhwb3J0cy5mYXN0UmVwZWF0ID0gYW5ndWxhclxuICAgICAgICAubW9kdWxlKCdmYXN0UmVwZWF0JywgW10pXG4gICAgICAgIC5kaXJlY3RpdmUoJ2Zhc3RSZXBlYXQnLCBmdW5jdGlvbiAoJHBhcnNlLCAkY29tcGlsZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzY29wZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgICAgICAgICAgIHByaW9yaXR5OiAxMDAwLFxuICAgICAgICAgICAgICAgIHRlcm1pbmFsOiB0cnVlLFxuICAgICAgICAgICAgICAgIGxpbms6IGZ1bmN0aW9uICgkc2NvcGUsICRlbGVtZW50LCAkYXR0cnMpIHtcbiAgICAgICAgICAgICAgICAgICAgZmFzdFJlcGVhdExpbmsoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHJzLCAkcGFyc2UsICRjb21waWxlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtICRzY29wZVxuICAgICAqIEBwYXJhbSAkZWxlbWVudFxuICAgICAqIEBwYXJhbSAkcGFyc2VcbiAgICAgKiBAcGFyYW0gJGNvbXBpbGVcbiAgICAgKiBAcGFyYW0ge3sgZmFzdFJlcGVhdDogc3RyaW5nIH19ICRhdHRyc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGZhc3RSZXBlYXRMaW5rKCRzY29wZSwgJGVsZW1lbnQsICRhdHRycywgJHBhcnNlLCAkY29tcGlsZSkge1xuICAgICAgICAvLyB0b2RvIC0gZGlyZWN0aXZlOiBkb250LWV2YWx1YXRlLWlmLW91dC1zY3JlZW5cbiAgICAgICAgLy8gdG9kbyAtIGFuaW1hdGlvbiBzdXBwb3J0XG4gICAgICAgIC8vIHRvZG8gLSBnYXJiYWdlIGNvbGxlY3Rpb24gZm9yIERPTSBub2RlcyAoPykgdGltZXItYmFzZWQ/XG5cbiAgICAgICAgdmFyIEhBU0hfS0VZID0gJyQkaGFzaEtleSc7XG5cbiAgICAgICAgaWYgKCduZ0luY2x1ZGUnIGluICRhdHRycykge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2Zhc3RSZXBlYXQ6IG5nSW5jbHVkZSBvbiByZXBlYXRlZCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdlbGVtZW50IGlzIG5vdCBzdXBwb3J0ZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ1BsZWFzZSBjcmVhdGUgaW5uZXIgZWxlbWVudCB3aXRoIG5nLWluY2x1ZGUuJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwYXJzZSBuZy1yZXBlYXQgZXhwcmVzc2lvbiAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgICAgIHZhciByeCA9IC9eXFxzKihcXHcrKVxcc2luXFxzKC4rPykoXFxzdHJhY2sgYnlcXHMoLis/KSk/JC87XG4gICAgICAgIHZhciBtYXRjaCA9ICRhdHRycy5mYXN0UmVwZWF0Lm1hdGNoKHJ4KTtcbiAgICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2Zhc3RSZXBlYXQ6IGV4cGVjdGVkIGZhc3RSZXBlYXQgaW4gZm9ybSBvZiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdge2l0ZW19IGluIHthcnJheX0gW3wgZmlsdGVyLCBldGNdYCBbdHJhY2sgYnkgXFwne2ZpZWxkfVxcJ10gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnYnV0IGdvdCBgJyArICRhdHRycy5mYXN0UmVwZWF0ICsgJ2AnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpdGVyYXRvck5hbWUgPSBtYXRjaFsxXTtcbiAgICAgICAgdmFyIGV4cHJlc3Npb24gPSBtYXRjaFsyXTtcbiAgICAgICAgdmFyIHRyYWNrQnkgPSBtYXRjaFs0XSB8fCBIQVNIX0tFWTtcbiAgICAgICAgdmFyIG1vZGVsID0gZ2V0TW9kZWwoKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG1vZGVsKSkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2Zhc3RSZXBlYXQ6IGV4cGVjdGVkIG1vZGVsIGAnICsgJGF0dHJzLmZhc3RSZXBlYXQgKyAnYCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICd0byBiZSBhbiBhcnJheSBidXQgZ290OiAnICsgU3RyaW5nKG1vZGVsKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBidWlsZCBET00gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgICAgIHZhciBpdGVtSGFzaFRvTm9kZU1hcCA9IHt9O1xuXG4gICAgICAgIHZhciBlbGVtZW50Tm9kZSA9ICRlbGVtZW50WzBdO1xuICAgICAgICB2YXIgZWxlbWVudFBhcmVudE5vZGUgPSBlbGVtZW50Tm9kZS5wYXJlbnROb2RlO1xuICAgICAgICB2YXIgZWxlbWVudE5vZGVJbmRleCA9IGdldE5vZGVJbmRleChlbGVtZW50Tm9kZSwgdHJ1ZSk7XG4gICAgICAgIHZhciB0ZW1wbGF0ZU5vZGUgPSBlbGVtZW50Tm9kZS5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICAgIHRlbXBsYXRlTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ2Zhc3QtcmVwZWF0Jyk7XG5cbiAgICAgICAgdmFyIHByZXZOb2RlID0gZWxlbWVudE5vZGU7XG4gICAgICAgIG1vZGVsLmZvckVhY2goZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgICAgIHZhciBub2RlID0gY3JlYXRlTm9kZShpdGVtKTtcbiAgICAgICAgICAgIGluc2VydEFmdGVyKG5vZGUsIHByZXZOb2RlKTtcbiAgICAgICAgICAgIHByZXZOb2RlID0gbm9kZTtcbiAgICAgICAgICAgIC8vIHN0b3JlIG5vZGVcbiAgICAgICAgICAgIGlmICh0cmFja0J5ID09PSBIQVNIX0tFWSkge1xuICAgICAgICAgICAgICAgIGl0ZW1bdHJhY2tCeV0gPSBkaWZmLmdldFVuaXF1ZUlkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpdGVtSGFzaFRvTm9kZU1hcFtpdGVtW3RyYWNrQnldXSA9IG5vZGU7XG4gICAgICAgIH0pO1xuICAgICAgICBoaWRlTm9kZShlbGVtZW50Tm9kZSk7XG5cbiAgICAgICAgLy8gd2F0Y2ggbW9kZWwgZm9yIGNoYW5nZXMgaWZcbiAgICAgICAgLy8gaXQgaXMgbm90IG9uZS10aW1lIGJpbmRpbmdcbiAgICAgICAgdmFyIHVud2F0Y2hNb2RlbDtcbiAgICAgICAgaWYgKCEvXjo6Ly50ZXN0KGV4cHJlc3Npb24pKSB7XG4gICAgICAgICAgICB1bndhdGNoTW9kZWwgPSAkc2NvcGUuJHdhdGNoQ29sbGVjdGlvbihnZXRNb2RlbCwgcmVuZGVyQ2hhbmdlcyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0TW9kZWwoKSB7XG4gICAgICAgICAgICByZXR1cm4gJHBhcnNlKGV4cHJlc3Npb24pKCRzY29wZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiByZW5kZXJDaGFuZ2VzKGxpc3QsIHByZXYpIHtcbiAgICAgICAgICAgIGlmIChsaXN0ID09PSBwcmV2KSByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciBkaWZmZXJlbmNlID0gZGlmZihsaXN0LCBwcmV2LCB0cmFja0J5KTtcblxuICAgICAgICAgICAgc3luY0RvbShkaWZmZXJlbmNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHN5bmNEb20oZGlmZmVyZW5jZSkge1xuICAgICAgICAgICAgdmFyIHByZXZOb2RlID0gZWxlbWVudE5vZGU7IC8vIGluc2VydCBuZXcgbm9kZSBhZnRlciBtZVxuICAgICAgICAgICAgZGlmZmVyZW5jZS5mb3JFYWNoKGZ1bmN0aW9uIChkaWZmRW50cnksIGkpIHtcbiAgICAgICAgICAgICAgICB2YXIgaXRlbSA9IGRpZmZFbnRyeS5pdGVtO1xuICAgICAgICAgICAgICAgIHZhciBub2RlID0gaXRlbUhhc2hUb05vZGVNYXBbaXRlbVt0cmFja0J5XV07XG4gICAgICAgICAgICAgICAgdmFyIG5vZGVJbmRleDtcblxuICAgICAgICAgICAgICAgIHN3aXRjaCAoZGlmZkVudHJ5LnN0YXRlKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBkaWZmLkNSRUFURUQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVJbmRleCA9IGdldE5vZGVJbmRleChub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZUluZGV4ICE9IGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zZXJ0QWZ0ZXIobm9kZSwgcHJldk5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaG93Tm9kZShub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZSA9IGNyZWF0ZU5vZGUoaXRlbSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zZXJ0QWZ0ZXIobm9kZSwgcHJldk5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBoYXNoS2V5ID0gZGlmZi5nZXRVbmlxdWVJZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1bdHJhY2tCeV0gPSBoYXNoS2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1IYXNoVG9Ob2RlTWFwW2hhc2hLZXldID0gbm9kZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgZGlmZi5NT1ZFRDpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBkaWZmLk5PVF9NT0RJRklFRDpcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVJbmRleCA9IGdldE5vZGVJbmRleChub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub2RlSW5kZXggIT0gaSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc2VydEFmdGVyKG5vZGUsIHByZXZOb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgZGlmZi5ERUxFVEVEOlxuICAgICAgICAgICAgICAgICAgICAgICAgaGlkZU5vZGUobm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2RlbGV0ZU5vZGUobm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2RlbGV0ZSBpdGVtSGFzaFRvTm9kZU1hcFtpdGVtW3RyYWNrQnldXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwcmV2Tm9kZSA9IG5vZGU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERPTSBvcGVyYXRpb25zIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgICAgICBmdW5jdGlvbiBpbnNlcnRBZnRlcihub2RlLCBhZnRlck5vZGUpIHtcbiAgICAgICAgICAgIGlmIChhZnRlck5vZGUubmV4dFNpYmxpbmcpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50UGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZSwgYWZ0ZXJOb2RlLm5leHRTaWJsaW5nKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZWxlbWVudFBhcmVudE5vZGUuYXBwZW5kQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVOb2RlKGl0ZW0pIHtcbiAgICAgICAgICAgIHZhciBzY29wZSA9ICRzY29wZS4kbmV3KCk7XG4gICAgICAgICAgICBzY29wZVtpdGVyYXRvck5hbWVdID0gaXRlbTtcblxuICAgICAgICAgICAgdmFyIG5vZGUgPSB0ZW1wbGF0ZU5vZGUuY2xvbmVOb2RlKHRydWUpO1xuXG4gICAgICAgICAgICBhbWVuZEl0ZW1TY29wZShzY29wZSwgbm9kZSk7XG4gICAgICAgICAgICAkY29tcGlsZShub2RlKShzY29wZSk7XG5cbiAgICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYW1lbmRJdGVtU2NvcGUoc2NvcGUsIG5vZGUpIHtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHNjb3BlLCB7XG4gICAgICAgICAgICAgICAgJGluZGV4OiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldE5vZGVJbmRleChub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJGZpcnN0OiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldE5vZGVJbmRleChub2RlKSA9PT0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJGxhc3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGVuZ3RoID0gZ2V0TW9kZWwoKS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Tm9kZUluZGV4KG5vZGUpID09PSBsZW5ndGgtMTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJG1pZGRsZToge1xuICAgICAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAhdGhpcy4kZmlyc3QgJiYgIXRoaXMuJGxhc3Q7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICRldmVuOiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJGluZGV4ICUgMiA9PT0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJG9kZDoge1xuICAgICAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiRpbmRleCAlIDIgPT09IDE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBzY29wZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dOb2RlKG5vZGUpIHtcbiAgICAgICAgICAgIG5vZGUuY2xhc3NOYW1lID0gbm9kZS5jbGFzc05hbWUuc2xpY2UoMCwgLTgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaGlkZU5vZGUobm9kZSkge1xuICAgICAgICAgICAgbm9kZS5jbGFzc05hbWUgKz0gJyBuZy1oaWRlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldE5vZGVJbmRleChub2RlLCBhYnNvbHV0ZSkge1xuICAgICAgICAgICAgdmFyIG5vZGVMaXN0ID0gZWxlbWVudFBhcmVudE5vZGUuY2hpbGROb2RlcztcbiAgICAgICAgICAgIHZhciBpbmRleCA9IFtdLmluZGV4T2YuY2FsbChub2RlTGlzdCwgbm9kZSk7XG4gICAgICAgICAgICBpZiAoIWFic29sdXRlKSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSBpbmRleCAtIGVsZW1lbnROb2RlSW5kZXggLSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB1bndhdGNoTW9kZWwoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG59KTtcbiJdfQ==
