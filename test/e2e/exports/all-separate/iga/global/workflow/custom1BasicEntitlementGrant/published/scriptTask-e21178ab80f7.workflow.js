var content = execution.getVariables();
var requestId = content.get('id');
var context = content.get('context');
var skipApproval = content.get('skipApproval');
var queryParams = {
    "_action": "update"
}
var entitlementType = content.get('entitlementType');

try {
    var decision = {
        "decision": "approved",
    }
    if(skipApproval && entitlementType == 'custom'){
        decision.comment = "Custom request auto-approved due to request context: " + context;
    }
    else if(skipApproval){
        decision.comment = "Request auto-approved due to request context: " + context;
    }    
    openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);

}
catch (e) {
    var failureReason = "Failure updating decision on request. Error message: " + e.message;
    var update = { 'comment': failureReason, 'failure': true };
    openidm.action('iga/governance/requests/' + requestId, 'POST', update, queryParams);
}
