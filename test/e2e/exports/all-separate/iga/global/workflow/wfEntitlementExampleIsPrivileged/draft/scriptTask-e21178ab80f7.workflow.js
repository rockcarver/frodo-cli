/*
Script nodes are used to invoke APIs or execute business logic.
You can invoke governance APIs or IDM APIs.
See https://backstage.forgerock.com/docs/idcloud/latest/identity-governance/administration/workflow-configure.html for more details.

Script nodes should return a single value and should have the
logic enclosed in a try-catch block.

Example:
try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  applicationId = requestObj.application.id;
}
catch (e) {
  failureReason = 'Validation failed: Error reading request with id ' + requestId;
}
*/
var content = execution.getVariables();
var requestId = content.get('id');
var context = content.get('context');
var lineItemId = content.get('lineItemId');
var queryParams = {
  "_action": "update"
}
var lineItemParams = {
  "_action": "updateRemediationStatus"
}
try {
  var decision = {
      "decision": "approved",
      "comment": "Request auto-approved due to request context: " + context
  }
  openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
}
catch (e) {
  var failureReason = "Failure updating decision on request. Error message: " + e.message;
  var update = {'comment': failureReason, 'failure': true};
  openidm.action('iga/governance/requests/' + requestId, 'POST', update, queryParams);
 

}
