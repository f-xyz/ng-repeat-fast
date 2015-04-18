(function () {
    'use strict';

    // todo: make bower package

    var indexOf = [].indexOf;

    /* istanbul ignore next */
    var console = (function createConsole(enabled) {

        var nativeConsole = window.console;

        function apply(fn) {
            return function () {
                if (enabled) {
                    fn.apply(nativeConsole, arguments);
                }
            }
        }

        return {
            log: apply(nativeConsole.log),
            time: apply(nativeConsole.time),
            timeEnd: apply(nativeConsole.timeEnd),
            table: apply(nativeConsole.table),
            get enabled() { return enabled },
            set enabled(value) { enabled = value }
        };

    })(true);

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
    /*
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
    */

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
        var parentNode = elementNode.parentNode;
        //console.log('element', elementNode);

        var elementNodeIndex = getNodeIndex(elementNode);

        var $template = $element.clone();
        $template.removeAttr('fast-repeat');
        //console.log($template[0].outerHTML.trim());

        var prevNode = elementNode;
        model.forEach(function (item, i) {
            var node = createNodeWithScope(item, i, model.length).node;
            insertAfter(node, prevNode);
            prevNode = node;

            item.$$hashKey = getNodeIndex(node);
            itemHashToNodeMap[item.$$hashKey] = node;
        });
        hideNode(elementNode);

        console.timeEnd('creating dom');

        // watch model for changes if
        // it is not one-time binding
        if (!/^::/.test(expression)) {
            // todo: make delayed(renderChanges) (?)
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
            console.log('difference', difference);

            console.time('dom');
            var prevNode; // insert new node after me
            difference.forEach(function (diffEntry, i) {
                var item = diffEntry.item;
                var node = itemHashToNodeMap[item.$$hashKey];
                var index, swapWithIndex, swapWithNode, swapWithItem;

                switch (diffEntry.state) {

                    case diff.CREATED:
                        if (node) {
                            index = item.$$hashKey;
                            swapWithIndex = elementNodeIndex + i + 1;
                            swapWithNode = getNodeByIndex(swapWithIndex);
                            console.log('NODE EXISTS', index, swapWithIndex);

                            if (node !== swapWithNode) {
                                if (!node.$swapped) {
                                    if (node.nodeType === 8) {
                                        // swap nodes
                                        insertAfter(swapWithNode.nextSibling, node.nextSibling);
                                        // swap comments
                                        insertAfter(swapWithNode, node);
                                        throw 123;
                                    } else {
                                        // swap nodes
                                        node.style.color = 'green';
                                        swapWithNode.style.color = 'red';
                                        insertAfter(swapWithNode, node);
                                        console.log('SWAP', node, swapWithNode);
                                    }
                                    swapWithNode.$swapped = true;
                                } else {
                                    swapWithNode.$swapped = false;
                                }
                            }

                            // show must go on!
                            showNode(node);
                        } else {
                            var nodeWithScope = createNodeWithScope(item, true);
                            node = nodeWithScope.node;
                            if (prevNode) {
                                insertAfter(node, prevNode);
                            } else {
                                insertAfter(node, elementNode);
                            }
                            // todo: remove is safe (?)
                            //nodeWithScope.scope.$digest();
                            item.$$hashKey = getNodeIndex(node);
                            itemHashToNodeMap[item.$$hashKey] = node;
                        }
                        break;

                    case diff.MOVED:
                        swapWithItem = list[diffEntry.iPrev];
                        swapWithNode = itemHashToNodeMap[swapWithItem.$$hashKey];

                        if (!node.$swapped) {
                            if (node.nodeType === 8) {
                                // swap nodes
                                insertAfter(node.nextSibling, swapWithNode.nextSibling);
                                // swap comments
                                insertAfter(node, swapWithNode);
                            } else {
                                // swap nodes
                                insertAfter(node, swapWithNode);
                            }
                            swapWithNode.$swapped = true;
                        } else {
                            node.$swapped = false;
                        }

                        break;

                    case diff.DELETED:
                        hideNode(node);
                        //deleteNode(node);
                        //delete itemHashToNodeMap[item.$$hashKey];
                        break;
                }

                prevNode = node;
            });

            console.timeEnd('dom');
            console.timeEnd('renderChanges');
        }

        // DOM operations /////////////////////////////////////////////////

        function insertAfter(node, afterNode) {
            if (afterNode.nextSibling) {
                // todo: consider moving before previous if
                if (afterNode.nodeType == 8) {
                    afterNode = afterNode.nextSibling;
                }
                parentNode.insertBefore(node, afterNode.nextSibling);
            } else {
                parentNode.appendChild(node);
            }
        }

        function createNodeWithScope(item, i, total) {
            var itemScope = $scope.$new();
            itemScope[iteratorName] = item;
            itemScope.$index = i;
            itemScope.$first = i == 0;
            // todo: compare with ng-repeat
            itemScope.$middle = i == Math.floor(total/2);
            itemScope.$last = i == total - 1;
            itemScope.$even = i % 2 == 0;
            itemScope.$odd = !itemScope.$even;

            var $clone = $template.clone();
            $compile($clone)(itemScope);

            var node = $clone[0];
            node.$swapped = false;

            return { node: node, scope: itemScope };
        }

        function showNode(node) {
            if (node.nodeType == 8) {
                node = node.nextSibling;
            }
            node.className = node.className.slice(0, -8);
        }

        function hideNode(node) {
            if (node.nodeType == 8) {
                node = node.nextSibling;
            }
            node.className += ' ng-hide';
        }

        function deleteNode(node) {
            if (node.nodeType == 8) {
                node.parentNode.removeChild(node.nextSibling);
            }
            node.parentNode.removeChild(node);
        }

        function getNodeIndex(node) {
            var nodeList = parentNode.childNodes;
            return indexOf.call(nodeList, node);
        }

        function getNodeByIndex(index) {
            var nodeList = parentNode.childNodes;
            return nodeList[index];
        }

        ///////////////////////////////////////////////////////////////////////////

        // todo: ?
        //$scope.$on('$destroy', function () {
        //    console.log('destroy');
        //    console.log($element);
        //});
    }

})();