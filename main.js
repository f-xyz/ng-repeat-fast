var N = 10000;
var app = angular.module('app', []);
app.config(function ($compileProvider) {
    $compileProvider.debugInfoEnabled(false);
});
app.run(function () {
   document.querySelector('.container').className += ' on';
});
app.controller('main', function ($scope) {
    $scope.useFastRepeat = true;
    $scope.list = [];
    $scope.search = '';
    $scope.filter = function (list, what) {
        return list.filter(function (x) {
            return x.value.indexOf(what) != -1;
        });
    };
    $scope.add = function (i) {
        var x = '';
        while (x.length < 20)
            x += i;
        $scope.list.push({ value: x });
    };
    $scope.addToEnd = function () {
        $scope.list.push({ value: 'very end' });
    };
    $scope.addToBegin = function () {
        $scope.list.unshift({ value: 'first one' });
    };
    $scope.add2nd = function () {
        var item = { value: '2nd' };
        var head = $scope.list.slice(0, 1);
        var tail = $scope.list.slice(1);
        $scope.list = head.concat([item], tail);
    };
    $scope.toggleFastRepeat = function () {
        $scope.useFastRepeat = !$scope.useFastRepeat;
    };

    for (var i = 0; i < N; ++i) {
        $scope.add(i);
    }

    scopeProfiler($scope);
    window.main = $scope;

    function scopeProfiler($scope) {
        var scopeApply = $scope.$apply;
        $scope.$apply = function () {
            console.time('$apply');
            var result = scopeApply.apply($scope, arguments);
            setTimeout(function () {
                console.timeEnd('$apply');
            }, 0);
            return result;
        };
        return $scope;
    }
});
app.directive('fastRepeat', function ($parse, $compile) {
    return {
        scope: false,
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

            // parse ng-repeat expression
            var match = $attrs.fastRepeat.match(/^\s*(\w+)\sin\s(.+)/);
            if (!match) {
                throw Error('Expected fastRepeat in form of ' +
                            '`{item} in {array} [| filter, etc]`' +
                            'but got `' + $attrs.fastRepeat + '`');
            }

            var iteratorName = match[1];
            var expression = match[2];
            console.log(expression);

            // build DOM
            console.time('creating dom');
            var elementNode = $element[0];
            var elementParentNode = elementNode.parentNode;

            var $template = $element.clone();
            $template.removeAttr('fast-repeat');

            var itemHashToNodeMap = {};

            var domFragment = document.createDocumentFragment();
            getModel().forEach(function (item) {
                item.$$hashKey = uniqueHash();
                var node = createNode(item);
                itemHashToNodeMap[item.$$hashKey] = node;
                domFragment.appendChild(node);
            });
            insertAfter(domFragment, elementNode);
            hideNode(elementNode);
            console.timeEnd('creating dom');

            // watch model for changes
            $scope.$watchCollection(getModel, renderChanges);

            ///////////////////////////////////////////////////////////////////

            function getModel() {
                return $parse(expression)($scope);
            }

            function uniqueHash() {
                if (!uniqueHash.value) {
                    uniqueHash.value = 0;
                }
                return uniqueHash.value++;
            }

            function renderChanges(list, prev) {
                if (list === prev) return;

                console.log('# renderChanges');
                console.time('renderChanges');
                //console.log('list', list);
                //console.log('prev', prev);

                console.time('diff');
                var difference = diff(list, prev, true, '$$hashKey');
                console.timeEnd('diff');
                //console.table(difference);

                console.time('dom');
                var prevNode; // insert new node after this
                difference.forEach(function (diffEntry, i) {
                    var item = diffEntry.item;
                    var node = getNodeFromItem(item);

                    if (diffEntry.state === diff.CREATED) {
                        if (node) {
                            showNode(node);
                        } else {
                            item.$$hashKey = uniqueHash();
                            node = createNode(item);
                            itemHashToNodeMap[item.$$hashKey] = node;
                            if (prevNode) {
                                insertAfter(node, prevNode);
                            } else {
                                insertAfter(node, elementNode);
                            }
                        }
                    } else if (diffEntry.state === diff.DELETED) {
                        if (++node.$$generation >= 3) {
                            hideNode(node);
                            //deleteNode(node);
                            //delete newItemHashToNodeMap[i];
                        } else {
                            hideNode(node);
                        }
                    }
                    // todo: process diff.MOVED
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

            function getNodeFromItem(item) {
                return itemHashToNodeMap[item.$$hashKey];
            }

            function createNode(item) {
                var clone = $template.clone();
                var itemScope = $scope.$new();
                itemScope[iteratorName] = item;

                $compile(clone)(itemScope);

                var node = clone[0];
                node.$$generation = 0;
                node.$$visible = true;

                return node;
            }

            function showNode(node) {
                node.style.display = 'block';
                //node.style.display = node.style.$$display || 'block';
            }

            function hideNode(node) {
                //node.style.$$display = node.style.display;
                node.style.display = 'none';
            }

            function deleteNode(node) {
                console.log('deleteNode');
                console.log(node);
                console.log(node.parentNode);

                node.parentNode.removeChild(node);
            }

        } // link
    };
});
app.directive('fastHighlight', function () {
    return {



        xlink: function ($scope, $element, $attrs) {
            var targetNodes = $element[0].querySelectorAll('[fast-highlight-target]');
            console.log(targetNodes);

            setTimeout(function () {
                $scope.$watch($attrs.fastHighlight, updateView);
            }, 0);

            [].forEach.call(targetNodes, function (node) {
                node.innerHTMLBackup = node.innerHTML;
            });

            function updateView(search) {
                if (search) {

                    var nodes = [].map.call($element[0].querySelectorAll('.hl'), function (node) {
                        return node.parentNode;
                    });
                    console.log('.hl number', nodes.length, $element);

                    //[].forEach.call(nodes, function (node) {
                    //    var rx = /<span class="hl">(.+?)<\/span>/gi;
                        //var rx = /./gi;
                        //node.innerHTML = node.innerHTML.replace(rx, function (match) {
                        //    console.warn(match);
                        //    return 1;
                        //});
                    //});

                    [].forEach.call(targetNodes, function (node) {
                        console.log(node);
                        //var rx = new RegExp(search, 'gi');
                        //node.innerHTML = node.innerHTML.replace(rx, function (match) {
                        //    return '<span class="hl">' + match + '</span>';
                        //});
                    });
                }
            }



        }
    };
});
app.directive('fastHighlightTarget', function () {
    return {
        require: '^fastHighlight',
        restrict: 'A'
    };
});
app.filter('highlight', function ($sce) {
    return function (str, search) {
        if (str && search) {
            var rx = new RegExp(search, 'i');
            var html = str.replace(rx, function (x) {
                return '<span class="hl">' + x + '</span>';
            });
            return $sce.trustAsHtml(html);
        }
        else {
            return $sce.trustAsHtml(str);
        }
    };
});
function pad(str, n, char) {
    while (str.length < n) {
        str = char + str;
    }
    return str;
}