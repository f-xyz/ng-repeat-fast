(function () {
    'use strict';

    chai.should();

    var $compile, $rootScope;
    var app = angular.module('app', ['fastRepeat']);
    var fastRepeatTemplate =
        '<div fast-repeat="item in list">' +
            '{{ ::item.value }}' +
        '</div>';

    /**
     * @param {string?} customTemplate
     * @returns {jQuery}
     */
    function createElement(customTemplate) {
        var template = customTemplate || fastRepeatTemplate;
        var element = $compile(template)($rootScope);
        $rootScope.$digest();
        return $(element[0].parentNode); // documentFragment
    }

    /**
     * @param container
     * @param [includeHidden]
     * @returns {jQuery[]}
     */
    function getItems(container, includeHidden) {
        if (includeHidden) {
            return container.children();
        } else {
            return container.children(':not(.ng-hide)');
        }
    }

    function dumpScope($scope) {
        var res = {};
        for (var key in $scope) {
            if (key[0] != '$'
            || ['$index', '$first', '$last', '$middle', '$odd', '$even']
                    .indexOf(key) != -1)
                res[key] = $scope[key];
        }
        return res;
    }

    var container;
    beforeEach(function () {
        module('app');
        inject(function ($injector) {
            $compile = $injector.get('$compile', '');
            $rootScope = $injector.get('$rootScope', '');
        });
        $rootScope.list = [{ value: 0 }, { value: 1 }];
        container = createElement();
    });

    describe('initialization', function () {

        it('throws if ng-include is set on repeated element', function () {
            $rootScope.list = [];
            var template = '<div fast-repeat="list" ng-include></div>';
            var action = function () {
                $compile(template)($rootScope);
            };
            action.should.throw();
        });

        it('parses ng-repeat expression', function () {
            var templates = [
                '<div fast-repeat="item in list"></div>',
                '<div fast-repeat="item in list | filter: 1"></div>',
                '<div fast-repeat="item in ::list"></div>'//,
                //'<div fast-repeat="item in ::list track by value"></div>'
            ];
            templates.forEach(function (template) {
                $compile(template)($rootScope);
            });
        });

        it('parses "track by expression"', function () {

            var oneTimeTemplate =
                '<div fast-repeat="item in list track by x">' +
                    '{{ ::item.value }}' +
                '</div>';
            container = createElement(oneTimeTemplate);

            $rootScope.list.forEach(function (x) {
                x.should.have.property('x');
            });

            var items = getItems(container);
            items.length.should.eq(2);
            items.eq(0).text().should.eq('0');
            items.eq(1).text().should.eq('1');
        });

        it('throws if expression is invalid', function () {
            var template = '<div fast-repeat="!@#"></div>';
            var action = function () {
                $compile(template)($rootScope);
            };
            action.should.throw();
        });

        it('throws if model is not an array of objects', function () {
            var models = [{}, null, undefined, 123, 'lol'];
            models.forEach(function (model) {
                $rootScope.list = model;
                var action = function () {
                    $compile(fastRepeatTemplate)($rootScope);
                };
                action.should.throw();
            });
        });

        it('understands one-time binding ::', function () {
            var oneTimeTemplate =
                '<div fast-repeat="item in ::list">' +
                    '{{ ::item.value }}' +
                '</div>';
            container = createElement(oneTimeTemplate);

            $rootScope.list.push({ value: 2 });

            var items = getItems(container);
            items.length.should.eq(2);
            items.eq(0).text().should.eq('0');
            items.eq(1).text().should.eq('1');
        });
    });

    describe('DOM sync.', function () {

        it('creates nodes', function () {
            $rootScope.list.push({ value: 2 });
            $rootScope.$digest();

            var items = getItems(container);
            items.length.should.eq(3);
            items.eq(0).text().should.eq('0');
            items.eq(1).text().should.eq('1');
            items.eq(2).text().should.eq('2');

            [].some.call(items, function (x, i) {
                var scope = $(x).scope();
                scope.$index.should.eq(i);
                scope.$first.should.eq(i == 0);
                scope.$last.should.eq(i == 2);
                scope.$middle.should.eq(i == 1);
                scope.$even.should.eq(i % 2 == 0);
                scope.$odd.should.eq(i % 2 == 1);
            });
        });

        it('removes nodes', function () {
            $rootScope.list = [];
            $rootScope.$digest();

            var items = getItems(container);
            items.length.should.eq(0);
        });

        it('adds node to the begin', function () {
            $rootScope.list.unshift({ value: -1 });
            $rootScope.$apply();

            var items = getItems(container);
            items.length.should.eq(3);
            items.eq(0).text().should.eq('-1');
            items.eq(1).text().should.eq('0');
            items.eq(2).text().should.eq('1');
        });

        it('adds node to the end', function () {
            $rootScope.list.push({ value: 2 });
            $rootScope.$digest();

            var items = getItems(container);
            items.length.should.eq(3);
            items.eq(0).text().should.eq('0');
            items.eq(1).text().should.eq('1');
            items.eq(2).text().should.eq('2');
        });

        it('reuses nodes after deletion and recreation', function () {
            var listBackup = $rootScope.list;
            var itemsBackup = getItems(container);

            $rootScope.list = [];
            $rootScope.$digest();

            $rootScope.list = listBackup;
            $rootScope.$digest();

            var items = getItems(container);
            items.should.eql(itemsBackup);
        });

        [2, 3, 7].forEach(function (n) {
            it('reverses list of ' + n + ' nodes', function () {

                $rootScope.list = [];
                $rootScope.$digest();

                for (var i = 0; i < n; ++i) {
                    $rootScope.list.push({ value: i });
                }
                $rootScope.$digest();

                $rootScope.list = $rootScope.list.reverse();
                $rootScope.$digest();

                var items = getItems(container);
                items.length.should.eq(n);
                [].forEach.call(items, function (x, i) {
                    x.textContent.should.eq(String(n-i-1));
                });
            }); // it
        }); // forEach

        xit('does not affect siblings', function () {
            var template =
                '<div fast-repeat="item in list track by \'value\'">' +
                    '{{ ::item.value }}' +
                '</div>';
            container = createElement(template);
        });

        it('reuses hidden node', function () {

        });

    }); // describe 'DOM sync.'

})();
