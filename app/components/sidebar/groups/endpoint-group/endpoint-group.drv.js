/**
 * @ngdoc directive
 * @name endpointGroup
 * @module components.sidebar.groups.endpoint
 *
 * @description
 * The directive representing the endpoint group in the sidebar accordion, showing the current endpoint and number of
 * requests. This directive also includes controls to stop and restart the extraction of tbox information.
 * 
 * @return {*}
 */
const endpointGroup = function() {

  return {
    restrict: 'E',
    scope: {},
    bindToController: {
      restart: '&',
      stop: '&'
    },
    controller: 'EndpointGroupCtrl',
    controllerAs: 'vm',
    template: require('./endpoint-group.html')
  };

};

export default endpointGroup;
