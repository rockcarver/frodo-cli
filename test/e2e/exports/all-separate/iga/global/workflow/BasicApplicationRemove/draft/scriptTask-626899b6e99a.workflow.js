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
        var request = requestObj.request;
        var payload = {
            "applicationId": request.common.applicationId,
            "auditContext": {},
            "grantType": "request"
        };
        var queryParams = {
            "_action": "remove",
            "initiatingUser": requestObj.requester.id
        }

        logger.info("Removing account: " + payload);
        var result = openidm.action('iga/governance/user/' + request.common.userId + '/applications', 'POST', payload, queryParams);
    }
    catch (e) {
        var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = "Deprovisioning failed: Error deprovisioning account to user " + request.common.userId + " for application " + request.common.applicationId + ". Error message: " + message;
    }
}

if (context == 'certification') {
    // If application removal request is created via certification, update the corresponding certification item with remediation status.
    try {
        var remediationStatus = failureReason ? "failed" : "complete"
        var comment = failureReason ? "Unable to remove the account successfully, remediation failed." : "Account has been removed from user successfully, remediation complete."
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
