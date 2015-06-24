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

    exports.fastRepeat =
         angular
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZi14eXotZGlmZi9pbmRleC5qcyIsInNyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIid1c2Ugc3RyaWN0JztcblxudmFyIERJRkZfTk9UX01PRElGSUVEID0gMDtcbnZhciBESUZGX0NSRUFURUQgPSAxO1xudmFyIERJRkZfTU9WRUQgPSAyO1xudmFyIERJRkZfREVMRVRFRCA9IC0xO1xuXG52YXIgbGFzdFVuaXF1ZUlkID0gMDtcblxuLyoqXG4gKiBSZXR1cm5zIGF1dG8gaW5jcmVtZW50YWwgdW5pcXVlIElEIGFzIGludGVnZXIuXG4gKiBAcmV0dXJucyB7bnVtYmVyfSBpbnRlZ2VycyBzdGFydGluZyBmcm9tIDBcbiAqL1xuZnVuY3Rpb24gZ2V0VW5pcXVlSWQoKSB7XG4gICAgcmV0dXJuIGxhc3RVbmlxdWVJZCsrO1xufVxuXG4vKipcbiAqIFJldHVybnMgeCBpZiBpdCBpcyBub3QgdW5kZWZpbmVkLCB5IG90aGVyd2lzZS5cbiAqIEBwYXJhbSB4XG4gKiBAcGFyYW0geVxuICogQHJldHVybnMgeyp9XG4gKi9cbmZ1bmN0aW9uIG1heWJlKHgsIHkpIHtcbiAgICBpZiAoeCAhPT0gdW5kZWZpbmVkKSByZXR1cm4geDtcbiAgICByZXR1cm4geTtcbn1cblxuLyoqXG4gKiBAcGFyYW0ge0FycmF5fSBsaXN0XG4gKiBAcGFyYW0ge3N0cmluZ30gcHJpbWFyeUtleVxuICogQHJldHVybnMge3t9fVxuICovXG5mdW5jdGlvbiBidWlsZEhhc2hUb0luZGV4TWFwKGxpc3QsIHByaW1hcnlLZXkpIHtcbiAgICB2YXIgbWFwID0ge307XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBpdGVtID0gbGlzdFtpXTtcbiAgICAgICAgbWFwW2l0ZW1bcHJpbWFyeUtleV1dID0gaTtcbiAgICB9XG4gICAgcmV0dXJuIG1hcDtcbn1cblxuLyoqXG4gKiBDYWxjdWxhdGVzIGRpZmZlcmVuY2UgYmV0d2VlbiB0d28gYXJyYXlzLlxuICogUmV0dXJucyBhcnJheSBvZiB7IGl0ZW06IFQsIHN0YXRlOiBpbnQgfS5cbiAqIFdoZXJlIHN0YXRlIG1lYW5zOiAwIC0gbm90IG1vZGlmaWVkLCAxIC0gY3JlYXRlZCwgLTEgLSBkZWxldGVkLlxuICogQHBhcmFtIHtBcnJheX0gbmV3TGlzdFxuICogQHBhcmFtIHtBcnJheX0gb2xkTGlzdFxuICogQHBhcmFtIHtzdHJpbmd9IHByaW1hcnlLZXkgaXRlbSdzIHVuaXF1ZSBpbmRleCBmaWVsZCBuYW1lXG4gKi9cbmZ1bmN0aW9uIGRpZmYobmV3TGlzdCwgb2xkTGlzdCwgcHJpbWFyeUtleSkge1xuICAgIHZhciBkaWZmID0gW107XG4gICAgdmFyIG5ld0luZGV4ID0gMDtcbiAgICB2YXIgb2xkSW5kZXggPSAwO1xuXG4gICAgdmFyIG5ld0luZGV4TWFwID0gYnVpbGRIYXNoVG9JbmRleE1hcChuZXdMaXN0LCBwcmltYXJ5S2V5KTtcbiAgICB2YXIgb2xkSW5kZXhNYXAgPSBidWlsZEhhc2hUb0luZGV4TWFwKG9sZExpc3QsIHByaW1hcnlLZXkpO1xuXG4gICAgZnVuY3Rpb24gYWRkRW50cnkoaXRlbSwgc3RhdGUsIG5ld0luZGV4LCBwcmV2SW5kZXgpIHtcbiAgICAgICAgZGlmZi5wdXNoKHtcbiAgICAgICAgICAgIGl0ZW06IGl0ZW0sXG4gICAgICAgICAgICBzdGF0ZTogc3RhdGUsXG4gICAgICAgICAgICBvbGRJbmRleDogcHJldkluZGV4LFxuICAgICAgICAgICAgbmV3SW5kZXg6IG5ld0luZGV4XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGZvciAoOyBuZXdJbmRleCA8IG5ld0xpc3QubGVuZ3RoIHx8IG9sZEluZGV4IDwgb2xkTGlzdC5sZW5ndGg7KSB7XG4gICAgICAgIHZhciBuZXdJdGVtID0gbmV3TGlzdFtuZXdJbmRleF07XG4gICAgICAgIHZhciBvbGRJdGVtID0gb2xkTGlzdFtvbGRJbmRleF07XG5cbiAgICAgICAgaWYgKG5ld0luZGV4ID49IG5ld0xpc3QubGVuZ3RoKSB7XG5cbiAgICAgICAgICAgIGFkZEVudHJ5KG9sZEl0ZW0sIERJRkZfREVMRVRFRCwgLTEsIG9sZEluZGV4KTtcbiAgICAgICAgICAgICsrb2xkSW5kZXg7XG5cbiAgICAgICAgfSBlbHNlIGlmIChvbGRJbmRleCA+PSBvbGRMaXN0Lmxlbmd0aCkge1xuXG4gICAgICAgICAgICBhZGRFbnRyeShuZXdJdGVtLCBESUZGX0NSRUFURUQsIG5ld0luZGV4LCAtMSk7XG4gICAgICAgICAgICArK25ld0luZGV4O1xuXG4gICAgICAgIH0gZWxzZSBpZiAobmV3SXRlbSAhPT0gb2xkSXRlbSkge1xuXG4gICAgICAgICAgICB2YXIgaW5kZXhPZk5ld0l0ZW1Jbk9sZExpc3QgPVxuICAgICAgICAgICAgICAgIG1heWJlKG9sZEluZGV4TWFwW25ld0l0ZW1bcHJpbWFyeUtleV1dLCAtMSk7XG5cbiAgICAgICAgICAgIHZhciBpbmRleE9mT2xkSXRlbUluTmV3TGlzdCA9XG4gICAgICAgICAgICAgICAgbWF5YmUobmV3SW5kZXhNYXBbb2xkSXRlbVtwcmltYXJ5S2V5XV0sIC0xKTtcblxuICAgICAgICAgICAgdmFyIGlzQ3JlYXRlZCA9IGluZGV4T2ZOZXdJdGVtSW5PbGRMaXN0ID09PSAtMTtcbiAgICAgICAgICAgIHZhciBpc0RlbGV0ZWQgPSBpbmRleE9mT2xkSXRlbUluTmV3TGlzdCA9PT0gLTE7XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZWRcbiAgICAgICAgICAgIGlmIChpc0NyZWF0ZWQpIHtcbiAgICAgICAgICAgICAgICBhZGRFbnRyeShuZXdJdGVtLCBESUZGX0NSRUFURUQsIG5ld0luZGV4LCAtMSk7XG4gICAgICAgICAgICAgICAgKytuZXdJbmRleDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbW92ZWRcbiAgICAgICAgICAgIGlmICghaXNDcmVhdGVkICYmICFpc0RlbGV0ZWQpIHtcbiAgICAgICAgICAgICAgICBhZGRFbnRyeShuZXdJdGVtLCBESUZGX01PVkVELCBuZXdJbmRleCwgaW5kZXhPZk9sZEl0ZW1Jbk5ld0xpc3QpO1xuICAgICAgICAgICAgICAgICsrbmV3SW5kZXg7XG4gICAgICAgICAgICAgICAgKytvbGRJbmRleDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZGVsZXRlZFxuICAgICAgICAgICAgaWYgKGlzRGVsZXRlZCkge1xuICAgICAgICAgICAgICAgIGFkZEVudHJ5KG9sZEl0ZW0sIERJRkZfREVMRVRFRCwgLTEsIG9sZEluZGV4KTtcbiAgICAgICAgICAgICAgICArK29sZEluZGV4O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBhZGRFbnRyeShvbGRJdGVtLCBESUZGX05PVF9NT0RJRklFRCwgbmV3SW5kZXgsIG9sZEluZGV4KTtcbiAgICAgICAgICAgICsrbmV3SW5kZXg7XG4gICAgICAgICAgICArK29sZEluZGV4O1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRpZmY7XG59XG5cbi8vIGV4cG9ydHMgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG5kaWZmLk5PVF9NT0RJRklFRCA9IERJRkZfTk9UX01PRElGSUVEO1xuZGlmZi5DUkVBVEVEID0gRElGRl9DUkVBVEVEO1xuZGlmZi5NT1ZFRCA9IERJRkZfTU9WRUQ7XG5kaWZmLkRFTEVURUQgPSBESUZGX0RFTEVURUQ7XG5kaWZmLmdldFVuaXF1ZUlkID0gZ2V0VW5pcXVlSWQ7XG5kaWZmLmJ1aWxkSGFzaFRvSW5kZXhNYXAgPSBidWlsZEhhc2hUb0luZGV4TWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGRpZmY7XG4iLCIoZnVuY3Rpb24gKGZhY3RvcnkpIHtcbiAgICBpZiAodHlwZW9mIHJlcXVpcmUgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB2YXIgZGlmZiA9IHJlcXVpcmUoJ2YteHl6LWRpZmYnKTtcbiAgICAgICAgZmFjdG9yeShtb2R1bGUuZXhwb3J0cywgZGlmZik7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZmFjdG9yeSh3aW5kb3csIHdpbmRvdy5kaWZmKTtcbiAgICB9XG59KShmdW5jdGlvbiBmYXN0UmVwZWF0TWFpbihleHBvcnRzLCBkaWZmKSB7XG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICBleHBvcnRzLmZhc3RSZXBlYXQgPVxuICAgICAgICAgYW5ndWxhclxuICAgICAgICAubW9kdWxlKCdmYXN0UmVwZWF0JywgW10pXG4gICAgICAgIC5kaXJlY3RpdmUoJ2Zhc3RSZXBlYXQnLCBmdW5jdGlvbiAoJHBhcnNlLCAkY29tcGlsZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBzY29wZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICByZXN0cmljdDogJ0EnLFxuICAgICAgICAgICAgICAgIHByaW9yaXR5OiAxMDAwLFxuICAgICAgICAgICAgICAgIHRlcm1pbmFsOiB0cnVlLFxuICAgICAgICAgICAgICAgIGxpbms6IGZ1bmN0aW9uICgkc2NvcGUsICRlbGVtZW50LCAkYXR0cnMpIHtcbiAgICAgICAgICAgICAgICAgICAgZmFzdFJlcGVhdExpbmsoJHNjb3BlLCAkZWxlbWVudCwgJGF0dHJzLCAkcGFyc2UsICRjb21waWxlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcblxuICAgIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgLyoqXG4gICAgICogQHBhcmFtICRzY29wZVxuICAgICAqIEBwYXJhbSAkZWxlbWVudFxuICAgICAqIEBwYXJhbSAkcGFyc2VcbiAgICAgKiBAcGFyYW0gJGNvbXBpbGVcbiAgICAgKiBAcGFyYW0ge3sgZmFzdFJlcGVhdDogc3RyaW5nIH19ICRhdHRyc1xuICAgICAqL1xuICAgIGZ1bmN0aW9uIGZhc3RSZXBlYXRMaW5rKCRzY29wZSwgJGVsZW1lbnQsICRhdHRycywgJHBhcnNlLCAkY29tcGlsZSkge1xuICAgICAgICAvLyB0b2RvIC0gZGlyZWN0aXZlOiBkb250LWV2YWx1YXRlLWlmLW91dC1zY3JlZW5cbiAgICAgICAgLy8gdG9kbyAtIGFuaW1hdGlvbiBzdXBwb3J0XG4gICAgICAgIC8vIHRvZG8gLSBnYXJiYWdlIGNvbGxlY3Rpb24gZm9yIERPTSBub2RlcyAoPykgdGltZXItYmFzZWQ/XG5cbiAgICAgICAgdmFyIEhBU0hfS0VZID0gJyQkaGFzaEtleSc7XG5cbiAgICAgICAgaWYgKCduZ0luY2x1ZGUnIGluICRhdHRycykge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2Zhc3RSZXBlYXQ6IG5nSW5jbHVkZSBvbiByZXBlYXRlZCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdlbGVtZW50IGlzIG5vdCBzdXBwb3J0ZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ1BsZWFzZSBjcmVhdGUgaW5uZXIgZWxlbWVudCB3aXRoIG5nLWluY2x1ZGUuJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBwYXJzZSBuZy1yZXBlYXQgZXhwcmVzc2lvbiAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgICAgIHZhciByeCA9IC9eXFxzKihcXHcrKVxcc2luXFxzKC4rPykoXFxzdHJhY2sgYnlcXHMoLis/KSk/JC87XG4gICAgICAgIHZhciBtYXRjaCA9ICRhdHRycy5mYXN0UmVwZWF0Lm1hdGNoKHJ4KTtcbiAgICAgICAgaWYgKCFtYXRjaCkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2Zhc3RSZXBlYXQ6IGV4cGVjdGVkIGZhc3RSZXBlYXQgaW4gZm9ybSBvZiAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdge2l0ZW19IGluIHthcnJheX0gW3wgZmlsdGVyLCBldGNdYCBbdHJhY2sgYnkgXFwne2ZpZWxkfVxcJ10gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnYnV0IGdvdCBgJyArICRhdHRycy5mYXN0UmVwZWF0ICsgJ2AnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpdGVyYXRvck5hbWUgPSBtYXRjaFsxXTtcbiAgICAgICAgdmFyIGV4cHJlc3Npb24gPSBtYXRjaFsyXTtcbiAgICAgICAgdmFyIHRyYWNrQnkgPSBtYXRjaFs0XSB8fCBIQVNIX0tFWTtcbiAgICAgICAgdmFyIG1vZGVsID0gZ2V0TW9kZWwoKTtcbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KG1vZGVsKSkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2Zhc3RSZXBlYXQ6IGV4cGVjdGVkIG1vZGVsIGAnICsgJGF0dHJzLmZhc3RSZXBlYXQgKyAnYCAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICd0byBiZSBhbiBhcnJheSBidXQgZ290OiAnICsgU3RyaW5nKG1vZGVsKSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBidWlsZCBET00gLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4gICAgICAgIHZhciBpdGVtSGFzaFRvTm9kZU1hcCA9IHt9O1xuXG4gICAgICAgIHZhciBlbGVtZW50Tm9kZSA9ICRlbGVtZW50WzBdO1xuICAgICAgICB2YXIgZWxlbWVudFBhcmVudE5vZGUgPSBlbGVtZW50Tm9kZS5wYXJlbnROb2RlO1xuICAgICAgICB2YXIgZWxlbWVudE5vZGVJbmRleCA9IGdldE5vZGVJbmRleChlbGVtZW50Tm9kZSwgdHJ1ZSk7XG4gICAgICAgIHZhciB0ZW1wbGF0ZU5vZGUgPSBlbGVtZW50Tm9kZS5jbG9uZU5vZGUodHJ1ZSk7XG4gICAgICAgIHRlbXBsYXRlTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ2Zhc3QtcmVwZWF0Jyk7XG5cbiAgICAgICAgdmFyIHByZXZOb2RlID0gZWxlbWVudE5vZGU7XG4gICAgICAgIG1vZGVsLmZvckVhY2goZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgICAgIHZhciBub2RlID0gY3JlYXRlTm9kZShpdGVtKTtcbiAgICAgICAgICAgIGluc2VydEFmdGVyKG5vZGUsIHByZXZOb2RlKTtcbiAgICAgICAgICAgIHByZXZOb2RlID0gbm9kZTtcbiAgICAgICAgICAgIC8vIHN0b3JlIG5vZGVcbiAgICAgICAgICAgIGlmICh0cmFja0J5ID09PSBIQVNIX0tFWSkge1xuICAgICAgICAgICAgICAgIGl0ZW1bdHJhY2tCeV0gPSBkaWZmLmdldFVuaXF1ZUlkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpdGVtSGFzaFRvTm9kZU1hcFtpdGVtW3RyYWNrQnldXSA9IG5vZGU7XG4gICAgICAgIH0pO1xuICAgICAgICBoaWRlTm9kZShlbGVtZW50Tm9kZSk7XG5cbiAgICAgICAgLy8gd2F0Y2ggbW9kZWwgZm9yIGNoYW5nZXMgaWZcbiAgICAgICAgLy8gaXQgaXMgbm90IG9uZS10aW1lIGJpbmRpbmdcbiAgICAgICAgdmFyIHVud2F0Y2hNb2RlbDtcbiAgICAgICAgaWYgKCEvXjo6Ly50ZXN0KGV4cHJlc3Npb24pKSB7XG4gICAgICAgICAgICB1bndhdGNoTW9kZWwgPSAkc2NvcGUuJHdhdGNoQ29sbGVjdGlvbihnZXRNb2RlbCwgcmVuZGVyQ2hhbmdlcyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICAgICAgZnVuY3Rpb24gZ2V0TW9kZWwoKSB7XG4gICAgICAgICAgICByZXR1cm4gJHBhcnNlKGV4cHJlc3Npb24pKCRzY29wZSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiByZW5kZXJDaGFuZ2VzKGxpc3QsIHByZXYpIHtcbiAgICAgICAgICAgIGlmIChsaXN0ID09PSBwcmV2KSByZXR1cm47XG5cbiAgICAgICAgICAgIHZhciBkaWZmZXJlbmNlID0gZGlmZihsaXN0LCBwcmV2LCB0cmFja0J5KTtcblxuICAgICAgICAgICAgc3luY0RvbShkaWZmZXJlbmNlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHN5bmNEb20oZGlmZmVyZW5jZSkge1xuICAgICAgICAgICAgdmFyIHByZXZOb2RlID0gZWxlbWVudE5vZGU7IC8vIGluc2VydCBuZXcgbm9kZSBhZnRlciBtZVxuICAgICAgICAgICAgZGlmZmVyZW5jZS5mb3JFYWNoKGZ1bmN0aW9uIChkaWZmRW50cnksIGkpIHtcbiAgICAgICAgICAgICAgICB2YXIgaXRlbSA9IGRpZmZFbnRyeS5pdGVtO1xuICAgICAgICAgICAgICAgIHZhciBub2RlID0gaXRlbUhhc2hUb05vZGVNYXBbaXRlbVt0cmFja0J5XV07XG4gICAgICAgICAgICAgICAgdmFyIG5vZGVJbmRleDtcblxuICAgICAgICAgICAgICAgIHN3aXRjaCAoZGlmZkVudHJ5LnN0YXRlKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBkaWZmLkNSRUFURUQ6XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVJbmRleCA9IGdldE5vZGVJbmRleChub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZUluZGV4ICE9IGkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zZXJ0QWZ0ZXIobm9kZSwgcHJldk5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzaG93Tm9kZShub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm9kZSA9IGNyZWF0ZU5vZGUoaXRlbSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5zZXJ0QWZ0ZXIobm9kZSwgcHJldk5vZGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBoYXNoS2V5ID0gZGlmZi5nZXRVbmlxdWVJZCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1bdHJhY2tCeV0gPSBoYXNoS2V5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1IYXNoVG9Ob2RlTWFwW2hhc2hLZXldID0gbm9kZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgZGlmZi5NT1ZFRDpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBkaWZmLk5PVF9NT0RJRklFRDpcbiAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVJbmRleCA9IGdldE5vZGVJbmRleChub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub2RlSW5kZXggIT0gaSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluc2VydEFmdGVyKG5vZGUsIHByZXZOb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgZGlmZi5ERUxFVEVEOlxuICAgICAgICAgICAgICAgICAgICAgICAgaGlkZU5vZGUobm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2RlbGV0ZU5vZGUobm9kZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAvL2RlbGV0ZSBpdGVtSGFzaFRvTm9kZU1hcFtpdGVtW3RyYWNrQnldXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwcmV2Tm9kZSA9IG5vZGU7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERPTSBvcGVyYXRpb25zIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuICAgICAgICBmdW5jdGlvbiBpbnNlcnRBZnRlcihub2RlLCBhZnRlck5vZGUpIHtcbiAgICAgICAgICAgIGlmIChhZnRlck5vZGUubmV4dFNpYmxpbmcpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50UGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZSwgYWZ0ZXJOb2RlLm5leHRTaWJsaW5nKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZWxlbWVudFBhcmVudE5vZGUuYXBwZW5kQ2hpbGQobm9kZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjcmVhdGVOb2RlKGl0ZW0pIHtcbiAgICAgICAgICAgIHZhciBzY29wZSA9ICRzY29wZS4kbmV3KCk7XG4gICAgICAgICAgICBzY29wZVtpdGVyYXRvck5hbWVdID0gaXRlbTtcblxuICAgICAgICAgICAgdmFyIG5vZGUgPSB0ZW1wbGF0ZU5vZGUuY2xvbmVOb2RlKHRydWUpO1xuXG4gICAgICAgICAgICBhbWVuZEl0ZW1TY29wZShzY29wZSwgbm9kZSk7XG4gICAgICAgICAgICAkY29tcGlsZShub2RlKShzY29wZSk7XG5cbiAgICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYW1lbmRJdGVtU2NvcGUoc2NvcGUsIG5vZGUpIHtcbiAgICAgICAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHNjb3BlLCB7XG4gICAgICAgICAgICAgICAgJGluZGV4OiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldE5vZGVJbmRleChub2RlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJGZpcnN0OiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGdldE5vZGVJbmRleChub2RlKSA9PT0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJGxhc3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGVuZ3RoID0gZ2V0TW9kZWwoKS5sZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZ2V0Tm9kZUluZGV4KG5vZGUpID09PSBsZW5ndGgtMTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJG1pZGRsZToge1xuICAgICAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiAhdGhpcy4kZmlyc3QgJiYgIXRoaXMuJGxhc3Q7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICRldmVuOiB7XG4gICAgICAgICAgICAgICAgICAgIGVudW1lcmFibGU6IHRydWUsXG4gICAgICAgICAgICAgICAgICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuJGluZGV4ICUgMiA9PT0gMDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgJG9kZDoge1xuICAgICAgICAgICAgICAgICAgICBlbnVtZXJhYmxlOiB0cnVlLFxuICAgICAgICAgICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLiRpbmRleCAlIDIgPT09IDE7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHJldHVybiBzY29wZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIHNob3dOb2RlKG5vZGUpIHtcbiAgICAgICAgICAgIG5vZGUuY2xhc3NOYW1lID0gbm9kZS5jbGFzc05hbWUuc2xpY2UoMCwgLTgpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gaGlkZU5vZGUobm9kZSkge1xuICAgICAgICAgICAgbm9kZS5jbGFzc05hbWUgKz0gJyBuZy1oaWRlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGdldE5vZGVJbmRleChub2RlLCBhYnNvbHV0ZSkge1xuICAgICAgICAgICAgdmFyIG5vZGVMaXN0ID0gZWxlbWVudFBhcmVudE5vZGUuY2hpbGROb2RlcztcbiAgICAgICAgICAgIHZhciBpbmRleCA9IFtdLmluZGV4T2YuY2FsbChub2RlTGlzdCwgbm9kZSk7XG4gICAgICAgICAgICBpZiAoIWFic29sdXRlKSB7XG4gICAgICAgICAgICAgICAgaW5kZXggPSBpbmRleCAtIGVsZW1lbnROb2RlSW5kZXggLSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgICAgICAgJHNjb3BlLiRvbignJGRlc3Ryb3knLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB1bndhdGNoTW9kZWwoKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG59KTtcbiJdfQ==
