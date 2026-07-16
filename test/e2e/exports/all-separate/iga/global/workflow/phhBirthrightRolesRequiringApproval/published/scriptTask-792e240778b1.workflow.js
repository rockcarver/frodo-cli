logger.info("Running user update event");
var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var userObj = null;
var userId = null;
//
// Read event user information from request object
try {
var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
userObj = requestObj.request.common.blob.after;
userId = userObj.userId;
}
catch (e) {
failureReason = "Validation failed: Error reading request with id " + requestId;
}
///Get Roles from Role Variable
var roleNames = requestObj.request.common.blob.parameters.roleNames.split(',');
logger.error("UpdateRequest with roleNames: " + roleNames);
// Look up roles in catalog
var operand = [];
for (var index in roleNames) {
var role = roleNames[index];
var roleClean = role.trim();
operand.push({operator: "EQUALS", operand: { targetName: "role.name", targetValue: roleClean }})
}
var body = { targetFilter: {operator: "OR", operand: operand}};
var catalog = openidm.action("iga/governance/catalog/search", "POST", body);
var catalogResults = catalog.result;
// Define request catalogs key
var catalogBody = [];
for (var idx in catalogResults) {
var catalog = catalogResults[idx];
catalogBody.push({type: "role", id: catalog.id})
}
// Define request payload
var requestBody = {
priority: "low",
accessModifier: "add",
justification: "Request submitted on user update.",
users: [ userId ],
catalogs: catalogBody,
context: {
type: "NoAdmin"
}
};
// Create requests
try {
logger.error("DRLCREATING REQUST for "+JSON.stringify(body));
openidm.action("iga/governance/requests", "POST", requestBody, {_action: "create"})
}
catch (e) {
failureReason = "Unable to generate requests for roles";
}
// Update event request as final
var decision = failureReason ?
{'status': 'complete', 'outcome': 'cancelled', 'decision': 'rejected', 'comment': failureReason, 'failure': true} :
{'status': 'complete', 'outcome': 'fulfilled', 'decision': 'approved'};
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info("Request " + requestId + " completed.");
