(function () {
    'use strict';

    chai.should();

    var app = angular.module('app', ['fastRepeat']);

    var $compile, $rootScope;
    var templateItem =
        '{{ ::item.value }}';
    var template =
        '<div fast-repeat="item in list">' +
            templateItem +
        '</div>';
    var templateNgInclude =
        '<div fast-repeat="item in list" ng-include="\'item\'"></div>';

    app.run(function ($templateCache) {
        $templateCache.put('item', templateItem);
    });

    /**
     * @param {function} f
     */
    function delay(f) {
        setTimeout(function () { f.apply(this) }, 0);
    }

    /**
     * @returns {jQuery}
     */
    function createElement() {
        // element is document fragment
        var element = $compile(template)($rootScope);
        $rootScope.$digest();

        return $(element[0].parentNode);
    }

    /**
     * @returns {jQuery}
     */
    function createElementWithNgInclude() {
        // element is document fragment
        var element = $compile(templateNgInclude)($rootScope);
        $rootScope.$digest();

        return $(element[0].parentNode);
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

    beforeEach(function () {
        module('app');
        inject(function ($injector) {
            $compile = $injector.get('$compile', '');
            $rootScope = $injector.get('$rootScope', '');
        });
    });

    describe('# basic DOM operations', function () {

        it('should render list', function () {
            // arrange, act
            $rootScope.list = [{ value: 0 }, { value: 1 }];
            var container = createElement();
            // assert
            var items = getItems(container);
            items.length.should.eq(2);
            items.eq(0).text().should.eq('0');
            items.eq(1).text().should.eq('1');
            // todo: check full DOM built
        });

        it('should hide template item', function () {
            // arrange, act
            $rootScope.list = [];
            var container = createElement();
            // assert
            container.children().length.should.eq(1);
            //container.children().should.eq();
        });

        it('should add node to the beginning', function () {
            // arrange
            $rootScope.list = [{ value: 0 }];
            var container = createElement();
            // act
            $rootScope.list.unshift({ value: -1 });
            $rootScope.$digest();
            // assert
            var items = getItems(container);
            items.length.should.eq(2);
            items.eq(0).text().should.eq('-1');
            items.eq(1).text().should.eq('0');
        });

        it('should add node to the end', function () {
            // arrange
            $rootScope.list = [{ value: 0 }];
            var container = createElement();
            // act
            $rootScope.list.push({ value: 1 });
            $rootScope.$digest();
            // assert
            var items = getItems(container);
            items.length.should.eq(2);
            items.eq(0).text().should.eq('0');
            items.eq(1).text().should.eq('1');
        });

        it('should insert node in the middle (2nd)', function () {
            // arrange
            $rootScope.list = [{ value: 0 }, { value: 1 }];
            var container = createElement();
            // act
            $rootScope.list = [$rootScope.list[0], { value: 0.5 }]
                .concat($rootScope.list.slice(1));
            $rootScope.$digest();
            // assert
            var items = getItems(container);
            items.length.should.eq(3);
            items.eq(0).text().should.eq('0');
            items.eq(1).text().should.eq('0.5');
            items.eq(2).text().should.eq('1');
        });

        it('should remove first node', function () {
            // arrange
            $rootScope.list = [{ value: 0 }, { value: 1 }];
            var container = createElement();
            // act
            $rootScope.list.shift();
            $rootScope.$digest();
            // assert
            var items = getItems(container);
            items.length.should.eq(1);
            items.eq(0).text().should.eq('1');
        });

        it('should remove last node', function () {
            // arrange
            $rootScope.list = [{ value: 0 }, { value: 1 }];
            var container = createElement();
            // act
            $rootScope.list.pop();
            $rootScope.$digest();
            // assert
            var items = getItems(container);
            items.length.should.eq(1);
            items.eq(0).text().should.eq('0');
        });

        it('should empty list', function () {
            // arrange
            $rootScope.list = [{ value: 0 }, { value: 1 }];
            var container = createElement();
            // act
            $rootScope.list = [];
            $rootScope.$digest();
            // assert
            var items = getItems(container);
            items.length.should.eq(0);
        });

        it('should swap two nodes', function () {
            // arrange
            $rootScope.list = [{ value: 0 }, { value: 1 }];
            var container = createElement();
            $rootScope.$digest();
            // act
            $rootScope.list = $rootScope.list.reverse();
            $rootScope.$digest();
            // assert
            var items = getItems(container);
            items.length.should.eq(2);
            items.eq(0).text().should.eq('1');
            items.eq(1).text().should.eq('0');
        });
    });

    xdescribe('# should work with ng-include', function () {
    });

    describe('# complex DOM operations', function () {

        it('should reuse hidden node if item has been added again', function () {
            // arrange
            var item = { value: 0 };
            $rootScope.list = [item];

            var container = createElement();
            $rootScope.$digest();

            // act
            $rootScope.list = [];
            $rootScope.$digest();

            $rootScope.list = [item];
            $rootScope.$digest();

            // assert
            var items = getItems(container);
            items.length.should.eq(1);
            items.eq(0).text().should.eq('0');
        });

    });

    describe('# initialization', function () {

        it('should throw if ng-include is set on repeated element', function () {
            $rootScope.list = [];
            var template = '<div fast-repeat="list" ng-include></div>';
            var action = function () {
                $compile(template)($rootScope);
            };
            action.should.throw();
        });

        it('should parse expression', function () {
            $rootScope.list = [];
            var templates = [
                '<div fast-repeat="item in list"></div>',
                '<div fast-repeat="item in ::list"></div>',
                //'<div fast-repeat="item in [1,2,3]"></div>',
                '<div fast-repeat="item in list | filter: 1"></div>'
            ];
            templates.forEach(function (template) {
                $compile(template)($rootScope);
            });
        });

        it('should throw if expression is invalid', function () {
            $rootScope.list = [];
            var template = '<div fast-repeat="lol"></div>';
            var action = function () {
                $compile(template)($rootScope);
            };
            action.should.throw();
        });

        it('should throw if model is not an array', function () {
            var models = [{}, null, undefined, 123, 'lol'];
            models.forEach(function (model) {
                $rootScope.list = model;
                var action = function () {
                    $compile(template)($rootScope);
                };
                action.should.throw();
            });
        });

    });

})();
