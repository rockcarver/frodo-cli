logger.info("Failure Handler: BirthRight Roles that need Approval ");
var content = execution.getVariables();
var requestId = content.get('requestId');
var failureReason = content.get('failureReason');
// Update event request as final
if (failureReason) {
var decision = {'status': 'complete', 'outcome': 'cancelled', 'decision': 'rejected', 'comment': failureReason, 'failure': true}
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info("Request " + requestId + " completed.");
}
