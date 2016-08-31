'use strict';

/**
 *
 * @param $scope
 * @param {$q} $q
 * @param {$location} $location
 * @param {$log} $log
 * @param Filters
 * @param {ClassExtractor} ClassExtractor
 * @param {RelationExtractor} RelationExtractor
 * @param TypeExtractor
 * @param DetailExtractor
 * @param Requests
 * @param RequestConfig
 * @param Prefixes
 * @param StopWatch
 * @param Data
 * @param View
 * @param Promises
 */
function graphCtrl($scope, $q, $location, $log, Filters, ClassExtractor, RelationExtractor, TypeExtractor,
                   DetailExtractor, Requests, RequestConfig, Prefixes, StopWatch, Data, View, Promises) {
  'ngInject';

  /* jshint validthis: true */
  var vm = this;

  vm.numberOfProps = 5;
  vm.numberOfPrefixes = 3;

  vm.filterTypes = !Filters.getIncludeLiterals();
  vm.filterLoops = !Filters.getIncludeLoops();
  vm.filterDisjointNodes = !Filters.getIncludeDisjointNode();
  vm.filterSubclassRelations = !Filters.getIncludeSubclassRelations();

  vm.differentColors = Prefixes.getDifferentColors();

  // jshint ignore:start
  vm.showEndpointUrl = __SHOW_ENDPOINT__; // eslint-disable-line no-undef
  // jshint ignore:end

  vm.requestedEndpoint = $location.search()['endpointURL'];
  vm.endpointURL = (vm.requestedEndpoint !== undefined) ? vm.requestedEndpoint : RequestConfig.getEndpointURL();
  vm.data = {};
  vm.data.nodes = [];

  vm.classes = [];

  $scope.ccEdgeLength = 80;
  $scope.ctEdgeLength = 20;

  $scope.prefixes = Prefixes.getPrefixes();

  // TODO avoid $scope, use controllerAs syntax instead
  $scope.selected = {
    uri: 'none',
    name: '',
    type: '',
    value: 0,
    props: []
  };

  $scope.showSelection = false;

  $scope.pendingRequests = Requests.getPendingRequests();
  $scope.failedRequests = Requests.getFailedRequests();
  $scope.successfulRequests = Requests.getSuccessfulRequests();
  $scope.errorStatus = Requests.getStatus();

  $scope.onClick = function(item) {
    $scope.$apply(function () {
      $scope.selected = item;
      DetailExtractor.requestCommentForClass(item.id);
      $scope.showSelection = true;
    });
  };

  $scope.$on('pending-requests-changed', function(event, pending) {
    $scope.pendingRequests = pending;
    $scope.successfulRequests = Requests.getSuccessfulRequests();
    $scope.failedRequests = Requests.getFailedRequests();
    $scope.errorStatus = Requests.getStatus();
  });

  $scope.$on('prefixes-changed', function () {
    $log.debug('[Graph] Prefixes have changed, update them...');
    $scope.prefixes = Prefixes.getPrefixes();
  });

  vm.incNumberOfProps = function () {
    vm.numberOfProps += 5;
  };

  vm.incNumberOfPrefixes = function () {
    vm.numberOfPrefixes += 5;
  };

  vm.toggleTypes = function () {
    vm.filterTypes = !Filters.toggleLiterals();
    if (!vm.filterTypes) {
      vm.loadTypes();
    }
  };

  vm.toggleLoops = function () {
    vm.filterLoops = !Filters.toggleLoops();
    if (!vm.filterLoops) {
      vm.loadLoops();
    }
  };

  vm.toggleDisjointNode = function () {
    vm.filterDisjointNodes = !Filters.toggleDisjointNode();
  };

  vm.toggleSubclassRelations = function() {
    vm.includeSubclassRelations = !Filters.toggleSubclassRelations();
  };

  vm.toggleDifferentColors = function () {
    vm.differentColors = Prefixes.toggleDifferentColors();
  };

  /**
   * Load loop relations, this means class-class relation from one class to itself.
   */
  vm.loadLoops = function () {
    for (var i = 0; i < vm.classes.length; i++) {
      var currentClass = vm.classes[i];
      if (currentClass.class !== undefined && currentClass.class.hasOwnProperty('value')) {
        RelationExtractor.requestClassClassRelation(currentClass.class.value, currentClass);
      }
    }
  };

  /**
   * Stop the extraction by rejecting all promises.
   */
  vm.stopLoading = function () {
    Promises.rejectAll();
    StopWatch.stop();
  };

  /**
   * First clear all loaded data, then restart Loading
   */
  vm.restartLoading = function () {
    Data.clearAll();
    vm.classes = [];
    StopWatch.stop();

    $log.warn('[Graph] Restart loading...');

    vm.startLoading();
  };

  /**
   * Start loading data requesting classes. For each class request referring types and search class-class relations.
   */
  vm.startLoading = function () {
    if (vm.endpointURL === undefined || vm.endpointURL === '') {
      Data.clearAll();
      RequestConfig.setEndpointURL();
      Data.initMaps();
      View.reset();

      // do not try to query an empty url
      return;
    } else {
      if (vm.endpointURL !== RequestConfig.getEndpointURL()) {
        Data.clearAll();
        RequestConfig.setEndpointURL(vm.endpointURL);
        Data.initMaps();
        View.reset();
      }

      // insert endpoint URL if missing
      $location.search('endpointURL', vm.endpointURL);
    }

    StopWatch.start();
    ClassExtractor.requestClasses().then(function extractForClasses(newClasses) {

      $log.debug('[Graph] Now the classes should be loaded!');

      // merge existing and new classes
      if (newClasses.length === 0) {
        $log.debug('[Graph] No new classes!');
      } else {
        for (let i = 0; i < newClasses.length; i++) {
          vm.classes.push(newClasses[i]);
        }
      }

      var promises = [];
      for (let end = 0; end < vm.classes.length; end++) {
        for (let start = 0; start < end; start++) {
          promises.push(RelationExtractor.requestClassEquality(vm.classes[start], vm.classes[end]));
        }
      }

      // after class equality is checked for all pairs, types and relations can be loaded
      $q.allSettled(promises).then(function extractForRemainingClasses(data) {

        $log.debug('[Graph] Now all should be settled!');

        // remove merged class for class list to avoid further request for these classes
        for (var i = 0; i < data.length; i++) {
          if (data[i]['state'] === 'fulfilled') {
            var indexToRemove = vm.classes.indexOf(data[i]['value']);

            if (indexToRemove !== -1) {
              vm.classes.splice(indexToRemove, 1);
              $log.debug(`[Graph] Removed '${data[i]['value']}' from class list.`);
            } else {
              $log.error(`[Graph] Unable to remove '${data[i]['value']}' from class list, class doesn't exist!`);
            }
          }
        }

        // optionally extract types referring to instances of the classes
        if (!vm.filterTypes) {
          vm.loadTypes();
        }

        vm.loadRelations();
      });
    });
  };

  /**
   * Load referring types for each class.
   */
  vm.loadTypes = function () {
    $log.debug('[Graph] Loading types...' + vm.classes.length);
    for (var i = 0; i < vm.classes.length; i++) {
      TypeExtractor.requestReferringTypes(vm.classes[i]);
    }
  };

  /**
   * Load relations for each pair of classes.
   */
  vm.loadRelations = function () {

    $log.debug('[Graph] Send requests for relations...');

    // for each pair of classes search relation and check equality
    for (let end = 0; end < vm.classes.length; end++) {
      for (let start = 0; start < vm.classes.length; start++) {
        if (!vm.filterLoops || start !== end) {
          var origin = vm.classes[start];
          var target = vm.classes[end];

          RelationExtractor.requestClassClassRelation(origin, target, 10, 0);
        }
      }
    }
  };

  /**
   * Update the prefixes to the current ones
   */
  vm.updatePrefixes = function () {
    Prefixes.setPrefixes($scope.prefixes);
  };

  vm.startLoading();

}

export default graphCtrl;
