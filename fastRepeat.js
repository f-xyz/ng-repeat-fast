(function () {
    'use strict';

    // todo: make bower package

    var indexOf = [].indexOf;

    //region createConsole
    /* istanbul ignore next */
    var console = (function createConsole(enabled) {

        var nativeConsole = window.console;

        function apply(fn) {
            if (enabled && fn) {
                return function () {
                    fn.apply(nativeConsole, arguments);
                }
            } else {
                return function () {};
            }
        }

        return {
            log: apply(nativeConsole.log),
            info: apply(nativeConsole.info),
            warn: apply(nativeConsole.warn),
            error: apply(nativeConsole.error),
            time: apply(nativeConsole.time),
            timeEnd: apply(nativeConsole.timeEnd),
            table: apply(nativeConsole.table),
            get enabled() { return enabled },
            set enabled(value) { enabled = value }
        };

    })(true);
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

    /**
     * @param {function} f
     * @returns {function}
     */
    function delayed(f) {
        // unused arguments are for
        // angular DI signature parser
        return function (a, b) {
            var args = arguments;
            setTimeout(function () {
                f.apply(this, args);
            }, 0);
        }
    }

    /**
     * @param $scope
     * @param $element
     * @param $parse
     * @param $compile
     * @param {{ fastRepeat: string }} $attrs
     */
    function fastRepeatLink($scope, $element, $attrs, $parse, $compile) {
        // todo - fix exception after
        //          1. Input 'x' to filter out all items
        //          2. Press Add 1st
        //          3. Press Add 2st
        //          4. Clear filter -> thrown
        // todo - animation support
        // todo - track by
        // todo - garbage collection for DOM nodes (?)
        //        timer-based?

        // parse ng-repeat expression /////////////////////////////////////////

        var match = $attrs.fastRepeat.match(/^\s*(\w+)\sin\s(.+)/);
        if (!match) {
            throw Error('fastRepeat: expected fastRepeat in form of ' +
                        '`{item} in {array} [| filter, etc]` ' +
                        'but got `' + $attrs.fastRepeat + '`');
        }

        var iteratorName = match[1];
        var expression = match[2];
        console.log(iteratorName + ' in ' + expression);

        var model = getModel();
        if (!Array.isArray(model)) {
            throw Error('fastRepeat: expected `' + $attrs.fastRepeat + '` ' +
                        'to be an array but got: ' + String(model));
        }

        // build DOM //////////////////////////////////////////////////////////

        var itemHashToNodeMap = {};

        console.time('creating dom');
        var elementNode = $element[0];
        var elementParentNode = elementNode.parentNode;
        var elementNodeIndex = getNodeIndex(elementNode, true);
        //console.log('element', elementNode);

        var $template = $element.clone();
        $template.removeAttr('fast-repeat');
        //console.log($template[0].outerHTML.trim());

        var prevNode = elementNode;
        model.forEach(function (item, i) {
            var node = createNode(item, i, model.length);
            insertAfter(node, prevNode);
            prevNode = node;
            // store node
            item.$$hashKey = diff.getUniqueKey();
            itemHashToNodeMap[item.$$hashKey] = node;
        });
        hideNode(elementNode);

        // remove comment nodes created by ng-include
        delayed(function () {
            console.time('removing comment nodes');
            model.forEach(replaceCommentNodeByNext);
            console.timeEnd('removing comment nodes');
        })();

        console.timeEnd('creating dom');

        // watch model for changes if
        // it is not one-time binding
        if (!/^::/.test(expression)) {
            $scope.$watchCollection(getModel, renderChanges);
        }

        ///////////////////////////////////////////////////////////////////

        function getModel() {
            return $parse(expression)($scope);
        }

        function renderChanges(list, prev) {
            if (list === prev) return;

            console.log('# renderChanges');
            console.time('renderChanges');
            //log('list', list);
            //log('prev', prev);

            console.time('diff');
            var difference = diff(list, prev, '$$hashKey');
            console.timeEnd('diff');
            console.table(difference.map(function (x) {
                x.value = x.item.value;
                x.$$hashKey = x.item.$$hashKey;
                return x;
            }));

            console.time('dom');
            var prevNode = elementNode; // insert new node after me
            difference.forEach(function (diffEntry, i) {
                var item = diffEntry.item;
                var node = itemHashToNodeMap[item.$$hashKey];
                var index, swapWithIndex, swapWithNode, swapWithItem;

                switch (diffEntry.state) {

                    case diff.CREATED:
                        if (node) {
                            // todo: check indexes and swap nodes
                            console.log('CREATE -> NODE EXISTS', item, node);
                            showNode(node);
                        } else {
                            console.log('CREATE -> NEW NODE', item, node);
                            // todo
                            node = createNode(item, i, difference.length);
                            insertAfter(node, prevNode);
                            item.$$hashKey = diff.getUniqueKey();
                            itemHashToNodeMap[item.$$hashKey] = node;
                            delayed(function () {
                                replaceCommentNodeByNext(item);
                            })();
                        }
                        break;

                    case diff.MOVED:
                        var nodeIndex = getNodeIndex(node);
                        if (nodeIndex != diffEntry.iList) {
                            // mode to index
                            swapWithNode = getNodeByIndex(diffEntry.iList);
                            elementParentNode.insertBefore(node, swapWithNode);
                        }
                        break;

                    case diff.DELETED:
                        console.log('DELETE', item, node);
                        hideNode(node);
                        //deleteNode(node);
                        //delete itemHashToNodeMap[item.$$hashKey];
                        break;
                }

                prevNode = node;
            });

            //delayed(function () {
            //    difference.forEach(function (item) {
            //        if (item.state === 1) {
            //            replaceCommentNodeByNext(item);
            //        }
            //    });
            //})();

            console.time('');
            console.timeEnd('');

            console.timeEnd('dom');
            console.timeEnd('renderChanges');
        }

        // DOM operations /////////////////////////////////////////////////

        function insertAfter(node, afterNode) {
            if (afterNode.nextSibling) {
                elementParentNode.insertBefore(node, afterNode.nextSibling);
            } else {
                elementParentNode.appendChild(node);
            }
        }

        function createNodeWithScope(item, i, total) {
            var itemScope = $scope.$new();
            itemScope[iteratorName] = item;
            itemScope.$index = i;
            itemScope.$first = i == 0;
            itemScope.$last = i == total - 1;
            itemScope.$middle = !itemScope.$first && !itemScope.$last;
            itemScope.$even = i % 2 == 0;
            itemScope.$odd = !itemScope.$even;

            var $clone = $template.clone();
            $compile($clone)(itemScope);

            var node = $clone[0];

            return { node: node, scope: itemScope };
        }

        function createNode(item, i, total) {
            return createNodeWithScope(item, i, total).node;
        }

        function showNode(node) {
            node.className = node.className.slice(0, -8);
        }

        function hideNode(node) {
            node.className += ' ng-hide';
        }

        function deleteNode(node) {
            node.parentNode.removeChild(node);
        }

        function getNodeIndex(node, absolute) {
            var nodeList = elementParentNode.childNodes;
            var index = indexOf.call(nodeList, node);
            if (!absolute) {
                index = index - elementNodeIndex - 1;
            }
            return index;
        }

        function getNodeByIndex(index, absolute) {
            var nodeList = elementParentNode.childNodes;
            if (!absolute) {
                index = index + elementNodeIndex + 1;
            }
            return nodeList[index];
        }

        function replaceCommentNodeByNext(item) {
            var node = itemHashToNodeMap[item.$$hashKey];
            // if comment node
            if (node.nodeType === 8) {
                var realNode = node.nextSibling;
                elementParentNode.removeChild(node);
                itemHashToNodeMap[item.$$hashKey] = realNode;
            }
        }

        ///////////////////////////////////////////////////////////////////////////

        // todo: cleanup (?) nothing is allocated?
        //$scope.$on('$destroy', function () {
        //    console.log('destroy');
        //    console.log($element);
        //});

        window.dump = function () {
            console.log('elementNode', elementNode);
            console.log('itemHashToNodeMap', itemHashToNodeMap);
        };
    }

})();
