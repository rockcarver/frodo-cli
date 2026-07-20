logger.info("Finalize Request:BirthRight Roles that need Approval");
var content = execution.getVariables();
var requestId = content.get('requestId');
var failureState = content.get('failureState');
if (!failureState) {
try {
// Update event request as final
var decision = {'status': 'complete', 'outcome': 'fulfilled', 'decision': 'rejected'}
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info("Request " + requestId + " completed.");
}
catch (e) {
execution.setVariable("failureState", "Unable to finalize request.");
}
}
