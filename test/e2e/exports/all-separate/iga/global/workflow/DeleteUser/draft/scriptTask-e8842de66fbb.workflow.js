logger.info("Delete User - marking request as auto approved.");

var content = execution.getVariables();
var requestId = content.get('id');
var queryParams = {
  "_action": "update"
}
try {
    var decision = {
        "decision": "approved",
        "comment": "Request auto-approved due to user having delete user privileges."
    }
    openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
}
catch (e) {
    var failureReason = "Failure updating decision on request. Error message: " + e.message;
    var update = {'comment': failureReason, 'failure': true};
    openidm.action('iga/governance/requests/' + requestId, 'POST', update, queryParams);
}
