var content = execution.getVariables();
var requestId = content.get('id');
logger.info("Modify Entitlement request id " + requestId + " - marking request as auto approved.");

var queryParams = {
  "_action": "update"
}
try {
    var decision = {
        "decision": "approved",
        "comment": "Request auto-approved due to user having modify privileges."
    }
    openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
}
catch (e) {
    var failureReason = "Failure updating decision on request id " + requestId + ". Error message: " + e.message;
    var update = {'comment': failureReason, 'failure': true};
    openidm.action('iga/governance/requests/' + requestId, 'POST', update, queryParams);
}
