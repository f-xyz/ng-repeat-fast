angular
.module('fastRepeat', [])
.directive('fastRepeat', function ($parse, $compile) {
    return {
        scope: true,
        restrict: 'A',
        priority: 1000,
        terminal: true,
        /**
         * @param $scope
         * @param $element
         * @param {{ fastRepeat: string }} $attrs
         */
        link: function ($scope, $element, $attrs) {
            console.log('# fast-repeat');

            // todo - animation support
            // todo - make possibility to run completely in read-only mode (:: etc)

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
                //console.table(difference);

                console.time('dom');
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

                        case diff.DELETED:
                            if (++node.$$generation >= 3) {
                                hideNode(node);
                                // todo: cleaning up mature nodes
                                //deleteNode(node);
                                //delete itemHashToNodeMap[item.$$hashKey];
                            } else {
                                hideNode(node);
                            }
                            break;

                        case diff.MOVED:
                            // todo: process diff.MOVED
                            // todo: make reference to an item ...
                            //       todo: after which to insert the node
                            //       todo: (in list-diff)
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
                node.$$generation = 0;

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
                node.parentNode.removeChild(node);
            }

            ///////////////////////////////////////////////////////////////////

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

        } // link
    };
});