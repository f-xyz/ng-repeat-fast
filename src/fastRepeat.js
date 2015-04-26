(function fastRepeatMain() {
    'use strict';

    // todo: make bower package

    var indexOf = [].indexOf;

    //region createConsole
    /* istanbul ignore next */
    var console = (function createConsole(global, enabled) {

        var nativeConsole = global.console;
        var nop = function () {};

        function apply(fn) {
            if (enabled && fn) {
                return function () {
                    fn.apply(nativeConsole, arguments);
                }
            } else {
                return nop;
            }
        }

        return {
            log: apply(nativeConsole.log),
            info: apply(nativeConsole.info),
            warn: apply(nativeConsole.warn),
            error: apply(nativeConsole.error),
            time: apply(nativeConsole.time),
            timeEnd: apply(nativeConsole.timeEnd),
            table: nop,//apply(nativeConsole.table),
            get enabled() { return enabled },
            set enabled(value) { enabled = value }
        };

    })(window, true || localStorage.debug);
    //endregion

    ///////////////////////////////////////////////////////////////////////////

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
        // todo - track by
        // todo - garbage collection for DOM nodes (?) timer-based?

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
        var trackBy = match[4] || '$$hashKey';
        var model = getModel();
        if (!Array.isArray(model)) {
            throw Error('fastRepeat: expected model `' + $attrs.fastRepeat + '` ' +
                        'to be an array but got: ' + String(model));
        }

        // build DOM //////////////////////////////////////////////////////////

        var itemHashToNodeMap = {};

        console.time('creating dom');
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
            var hashKey = diff.getUniqueId();
            item[trackBy] = hashKey;
            itemHashToNodeMap[hashKey] = node;
        });
        hideNode(elementNode);

        console.timeEnd('creating dom');

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

            // todo: just empty all if list.length == 0

            console.time('renderChanges');

            console.time('diff');
            var difference = diff(list, prev, trackBy);
            console.timeEnd('diff');
            console.table(difference.map(function (x) {
                return {
                    state: x.state,
                    value: x.item.value,
                    oldIndex: x.oldIndex,
                    newIndex: x.newIndex
                };
            }));

            console.time('dom');
            syncDom(difference);
            console.timeEnd('dom');

            console.timeEnd('renderChanges');
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
                            //console.log('CREATED (existing)', node);
                            nodeIndex = getNodeIndex(node);
                            if (nodeIndex != i) {
                                insertAfter(node, prevNode);
                            }
                            showNode(node);
                        } else {
                            //console.log('CREATED (new)');
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
                        return this.$index % 2 == 0;
                    }
                },
                $odd: {
                    enumerable: true,
                    get: function () {
                        return this.$index % 2 == 1;
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
            var index = indexOf.call(nodeList, node);
            if (!absolute) {
                index = index - elementNodeIndex - 1;
            }
            return index;
        }

        ///////////////////////////////////////////////////////////////////////////

        $scope.$on('$destroy', function () {
            console.log('destroy');
            unwatchModel();
        });
    }

}());
