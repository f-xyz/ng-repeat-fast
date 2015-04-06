angular
.module('fastRepeat', [])
.directive('fastRepeat', function ($parse, $compile) {
    return {
        scope: false,
        restrict: 'A',
        priority: 1000,
        /**
         * @param $scope
         * @param $element
         * @param {{ fastRepeat: string }} $attrs
         */
        link: function ($scope, $element, $attrs) {
            console.log('# fast-repeat');

            // parse ng-repeat expression
            var match = $attrs.fastRepeat.match(/^\s*(\w+)\sin\s(.+)/);
            if (!match) {
                throw Error('Expected fastRepeat in form of ' +
                            '`{item} in {array} [| filter, etc]` ' +
                            'but got `' + $attrs.fastRepeat + '`');
            }

            var iteratorName = match[1];
            var expression = match[2];
            console.log(iteratorName + ' in ' + expression);

            // build DOM
            console.time('creating dom');
            var elementNode = $element[0];
            var elementParentNode = elementNode.parentNode;

            var $template = $element.clone();
            $template.removeAttr('fast-repeat');

            var itemHashToNodeMap = {};

            var model = getModel()/* || []*/;
            if (model) {
                var domFragment = document.createDocumentFragment();
                model.forEach(function (item) {
                    item.$$hashKey = diff.getUniqueKey();
                    var node = createNode(item);
                    itemHashToNodeMap[item.$$hashKey] = node;
                    domFragment.appendChild(node);
                });
                insertAfter(domFragment, elementNode);
            }
            hideNode(elementNode);
            console.timeEnd('creating dom');

            // watch model for changes
            if (!/^::/.test(expression)) { // not one-time binding
                $scope.$watchCollection(getModel, delay(renderChanges));
            }

            ///////////////////////////////////////////////////////////////////

            function getModel() {
                return $parse(expression)($scope);
            }

            function renderChanges(list, prev) {
                if (list === prev) return;

                // ?
                if (!prev) prev = [];
                if (!list) list = [];

                console.log('# renderChanges');
                console.time('renderChanges');
                //console.log('list', list);
                //console.log('prev', prev);

                console.time('diff');
                var difference = diff(list, prev, '$$hashKey');
                console.timeEnd('diff');
                //console.table(difference);

                console.time('dom');
                var prevNode; // insert new node after this
                difference.forEach(function (diffEntry, i) {
                    var item = diffEntry.item;
                    var node = itemHashToNodeMap[item.$$hashKey];

                    switch (diffEntry.state) {

                        case diff.CREATED:
                            if (node) {
                                showNode(node);
                            } else {
                                item.$$hashKey = diff.getUniqueKey();
                                node = createNode(item, true);
                                itemHashToNodeMap[item.$$hashKey] = node;
                                if (prevNode) {
                                    insertAfter(node, prevNode);
                                } else {
                                    insertAfter(node, elementNode);
                                }
                            }
                            break;

                        case diff.DELETED:
                            if (++node.$$generation >= 3) {
                                hideNode(node);
                                //deleteNode(node);
                                //delete itemHashToNodeMap[item.$$hashKey];
                            } else {
                                hideNode(node);
                            }
                            break;

                        case diff.MOVED:
                            // todo: process diff.MOVED
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
                    elementParentNode.insertBefore(node, afterNode.nextSibling);
                } else {
                    elementParentNode.appendChild(node);
                }
            }

            function createNode(item, apply) {
                var $clone = $template.clone();
                var itemScope = $scope.$new();
                itemScope[iteratorName] = item;

                $compile($clone)(itemScope);

                if (apply) {
                    itemScope.$digest();
                }

                var node = $clone[0];
                node.$$generation = 0;
                node.$$visible = true;

                return node;
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

            ///////////////////////////////////////////////////////////////////

            function delay(f) {
                // unused arguments are for angular
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