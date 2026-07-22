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
var requestObj = null;
var appId = null;
var appGlossary = null;
var lob = null;
try {
requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
appId = requestObj.application.id;
}
catch (e) {
logger.info("Validation failed: Error reading application grant request with id " + requestId);
}
try {
appGlossary = openidm.action('iga/governance/application/' + appId + '/glossary', 'GET', {}, {});
lob = appGlossary.lineOfBusiness || "default"
execution.setVariable("lob", lob);
}
catch (e) {
logger.info("Could not retrieve glossary with appId " + appId + " from application grant request ID " + requestId);
}
