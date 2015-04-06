var N = 5;//000;
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