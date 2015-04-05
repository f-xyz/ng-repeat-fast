var N = 10000;
var app = angular.module('app', ['fastRepeat']);
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
        $scope.list.push({ value: 'last one' });
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