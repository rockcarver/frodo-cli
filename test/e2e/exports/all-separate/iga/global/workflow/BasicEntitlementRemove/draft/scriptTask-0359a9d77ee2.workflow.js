logger.info("Deprovisioning");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var context = content.get('context');
var lineItemId = content.get('lineItemId');

try {
    // Read request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
}
catch (e) {
    failureReason = "Deprovisioning failed: Error reading request with id " + requestId;
}

// Create object to update final request progress
var decision = { 'status': 'complete', 'decision': 'approved' };

if (!failureReason) {
    try {
        // Remove entitlement grant from user
        var request = requestObj.request;
        var payload = {
            "entitlementId": request.common.entitlementId,
            "accountId": request.common.accountId,
            "applicationId" : requestObj.application.id,
            "startDate": request.common.startDate,
            "endDate": request.common.endDate,
            "auditContext": {},
            "grantType": "request"
        };
        var queryParams = {
            "_action": "remove",
            "initiatingUser": requestObj.requester.id
        }
        var endpoint = `${request.common.userId ? 'iga/governance/user/' + request.common.userId  : 'iga/governance/account/' + request.common.accountId}/entitlements`;
        var result = openidm.action(endpoint, 'POST', payload, queryParams);
    }
    catch (e) {
        var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = "Deprovisioning failed: Error deprovisioning entitlement to user " + request.common.userId + " for entitlement " + request.common.entitlementId + ". Error message: " + message;
    }
}

if (context == 'certification') {
    // If entitlement removal request is created via certification, update the corresponding certification item with remediation status.
    try {
        var remediationStatus = failureReason ? "failed" : "complete"
        var comment = failureReason ? "Unable to remove the entitlement successfully, remediation failed." : "Entitlement has been removed from user successfully, remediation complete."
        var body = {
            "remediationStatus": remediationStatus,
            "comment": comment
        }
        var lineItemParams = {
            "_action": "updateRemediationStatus"
        }
        openidm.action('iga/governance/certification/items/' + lineItemId, 'POST', body, lineItemParams);
    }
    catch (e) {
        failureReason = "Unable to update the certification line item " + lineItemId + " with the final remediation status from this request."
    }
}

// Set additional properties on the request progress update
if (failureReason) {
    decision.outcome = 'not provisioned';
    decision.comment = failureReason;
    decision.failure = true;
}
else {
    decision.outcome = 'provisioned';
}

// Update final request progress
var queryParams = { '_action': 'update' };
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info("Request " + requestId + " completed.");
