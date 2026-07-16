logger.info("Running user update event");
var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var context = null;
var skipApproval = false;
var userObj = null;
var userId = null;
// Read event user information from request object
try {
var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
logger.error("requestObj "+JSON.stringify(requestObj));
if (requestObj.request.common.context) {
context = requestObj.request.common.context.type;
if (context == 'admin') {
skipApproval = true;
}
}
userObj = requestObj.request.common.blob.after;
userId = userObj.userId;
}
catch (e) {
failureReason = "Validation failed: Error reading request with id " + requestId;
}
logger.info("Context: " + context);
execution.setVariable("context", context);
execution.setVariable("skipApproval", skipApproval);
