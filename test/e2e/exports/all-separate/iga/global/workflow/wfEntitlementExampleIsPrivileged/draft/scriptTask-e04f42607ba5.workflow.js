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
var context = null;
var skipApproval = false;
var lineItemId = false;
try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  if (requestObj.request.common.context) {
    context = requestObj.request.common.context.type;
    lineItemId = requestObj.request.common.context.lineItemId;
    if (context == 'admin') {
      skipApproval = true;
    }
  }
}
catch (e) {
  logger.info("Request Context Check failed "+e.message);
}

logger.info("Context: " + context);
execution.setVariable("context", context);
execution.setVariable("lineItemId", lineItemId);
execution.setVariable("skipApproval", skipApproval);
