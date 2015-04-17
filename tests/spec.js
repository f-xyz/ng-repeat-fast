chai.should();

var app = angular.module('app', ['fastRepeat']);

var $compile, $rootScope;
var template = '<div fast-repeat="item in list">{{ ::item }}</div>';

//module('app');
//inject(function ($injector) {
//    $compile = $injector.get('$compile', '');
//});

describe('# basic tests', function () {

    beforeEach(function () {
        module('app');
        inject(function (o$injector) {
            $compile = $injector.get('$compile', '');
            $rootScope = $injector.get('$rootScope', '');
            console.log($compile);
        });
    });

    it('-> should exist', function () {
        $rootScope.list = [1, 2, 3];
        var element = $(template);
        $compile(element)($rootScope);
        console.log('#', element.html());
    });
});
