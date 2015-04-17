(function () {
    'use strict';

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
        console.log('# fast-repeat');

        // todo - animation support
        // todo - track by
        // todo - garbage collection for DOM nodes (?)

        // parse ng-repeat expression
        var match = $attrs.fastRepeat.match(/^\s*(\w+)\sin\s(.+)/);
        if (!match) {
            throw Error('fastRepeat: expected fastRepeat in form of ' +
            '`{item} in {array} [| filter, etc]` ' +
            'but got `' + $attrs.fastRepeat + '`');
        }

        var iteratorName = match[1];
        var expression = match[2];
        console.log(iteratorName + ' in ' + expression);

        console.time('creating dom');
        var elementNode = $element[0];
        var elementParentNode = elementNode.parentNode;
        console.log('element', elementNode);

        var $template = $element.clone();
        $template.removeAttr('fast-repeat');
        console.log($template[0].outerHTML.trim());

        var itemHashToNodeMap = {};

        var model = getModel();
        if (!Array.isArray(model)) {
            throw Error('fastRepeat: expected `' + $attrs.fastRepeat + '` ' +
            'to be an array but got: ' + String(model));
        }

        // build DOM
        var domFragment = document.createDocumentFragment();
        model.forEach(function (item, i) {
            item.$$hashKey = diff.getUniqueKey();
            var node = createNodeWithScope(item, i, model.length).node;
            itemHashToNodeMap[item.$$hashKey] = node;
            domFragment.appendChild(node);
        });
        insertAfter(domFragment, elementNode);
        hideNode(elementNode);
        console.timeEnd('creating dom');

        // watch model for changes if
        // it is not one-time binding
        if (!/^::/.test(expression)) {
            $scope.$watchCollection(getModel, delayed(renderChanges));
        }

        ///////////////////////////////////////////////////////////////////

        function getModel() {
            return $parse(expression)($scope);
        }

        function renderChanges(list, prev) {
            if (list === prev) return;

            console.log('# renderChanges');
            console.time('renderChanges');
            //console.log('list', list);
            //console.log('prev', prev);

            console.time('diff');
            var difference = diff(list, prev, '$$hashKey');
            console.timeEnd('diff');
            console.log('difference', difference);

            console.time('dom');
            // todo: extract function
            var prevNode; // insert new node after me
            difference.forEach(function (diffEntry) {
                var item = diffEntry.item;
                var node = itemHashToNodeMap[item.$$hashKey];

                switch (diffEntry.state) {

                    case diff.CREATED:
                        if (node) {
                            showNode(node);
                        } else {
                            item.$$hashKey = diff.getUniqueKey();
                            var nodeWithScope = createNodeWithScope(item, true);
                            node = nodeWithScope.node;
                            if (prevNode) {
                                insertAfter(node, prevNode);
                            } else {
                                insertAfter(node, elementNode);
                            }
                            nodeWithScope.scope.$digest();
                            itemHashToNodeMap[item.$$hashKey] = node;
                        }
                        break;

                    case diff.MOVED:
                        var swapWithItem = list[diffEntry.iPrev];
                        var swapWithNode = itemHashToNodeMap[swapWithItem.$$hashKey];

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
            itemScope.$even = i % 2 == 0;
            itemScope.$odd = !itemScope.$even;

            var $clone = $template.clone();
            $compile($clone)(itemScope);

            var node = $clone[0];

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

        ///////////////////////////////////////////////////////////////////////////

        $scope.$on('$destroy', function () {
            console.log('destroy');
            console.log($element);
        });
    }

})();
