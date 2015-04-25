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

    })(window, localStorage.debug);
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

        var match = $attrs.fastRepeat.match(/^\s*(\w+)\sin\s(.+)/);
        if (!match) {
            throw Error('fastRepeat: expected fastRepeat in form of ' +
                        '`{item} in {array} [| filter, etc]` ' +
                        'but got `' + $attrs.fastRepeat + '`');
        }

        var iteratorName = match[1];
        var expression = match[2];
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
        var templateNode = $element.clone();
        templateNode.removeAttr('fast-repeat');

        var prevNode = elementNode;
        model.forEach(function (item, i) {
            var node = createNode(item, i, model.length);
            insertAfter(node, prevNode);
            prevNode = node;
            // store node
            item.$$hashKey = diff.getUniqueId();
            itemHashToNodeMap[item.$$hashKey] = node;
        });
        hideNode(elementNode);

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

            // todo: just empty all if list.length == 0

            console.time('renderChanges');

            console.time('diff');
            var difference = diff(list, prev, '$$hashKey');
            console.timeEnd('diff');
            console.table(difference.map(function (x) {
                x.value = x.item.value;
                x.$$hashKey = x.item.$$hashKey;
                return {
                    state: x.state,
                    value: x.item.value,
                    oldIndex: x.oldIndex,
                    newIndex: x.newIndex,
                    $$hashKey: x.item.$$hashKey
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
                var node = itemHashToNodeMap[item.$$hashKey];

                switch (diffEntry.state) {

                    case diff.CREATED:
                        if (node) {
                            console.log('CREATED (existing)', node);
                            insertAfter(node, prevNode);
                            showNode(node);
                        } else {
                            console.log('CREATED (new)');
                            node = createNode(item, i, difference.length);
                            insertAfter(node, prevNode);
                            item.$$hashKey = diff.getUniqueId();
                            itemHashToNodeMap[item.$$hashKey] = node;
                        }
                        break;

                    case diff.MOVED:
                    case diff.NOT_MODIFIED:
                        // todo: don't move node if not necessary
                        insertAfter(node, prevNode);
                        break;

                    case diff.DELETED:
                        hideNode(node);
                        //deleteNode(node);
                        //delete itemHashToNodeMap[item.$$hashKey];
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

        function createNode(item, i, total) {
            var itemScope = $scope.$new();
            itemScope[iteratorName] = item;
            itemScope.$index = i;
            itemScope.$first = i == 0;
            itemScope.$last = i == total - 1;
            itemScope.$middle = !itemScope.$first && !itemScope.$last;
            itemScope.$even = i % 2 == 0;
            itemScope.$odd = !itemScope.$even;

            var $clone = templateNode.clone();
            $compile($clone)(itemScope);

            return $clone[0];
        }

        function showNode(node) {
            node.className = node.className.slice(0, -8);
        }

        function hideNode(node) {
            node.className += ' ng-hide';
        }

        //function deleteNode(node) {
        //    elementParentNode.removeChild(node);
        //}

        ///////////////////////////////////////////////////////////////////////////

        // todo: destroy items' scopes
        //$scope.$on('$destroy', function () {
        //    console.log('destroy');
        //    console.log($element);
        //});
    }

}());
