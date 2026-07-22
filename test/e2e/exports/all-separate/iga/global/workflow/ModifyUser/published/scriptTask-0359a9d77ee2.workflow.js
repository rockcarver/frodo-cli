var content = execution.getVariables();
var requestId = content.get('id');
logger.info("Modify User request id " + requestId + " - modifying user");

var failureReason = null;

try {
    // Read request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
}
catch (e) {
    failureReason = "Modify user failed: Error reading request with id " + requestId;
}

if(!failureReason) {
    var modifiedAttributes = requestObj.request.user.object;
    var userId = requestObj.request.user.userId;
    try {
        var payload = [];

        for(var key in modifiedAttributes) {
            payload.push({
                "operation": "replace",
                "field": "/" + key,
                "value": modifiedAttributes[key]
            })
        }

        var result = openidm.patch('managed/alpha_user/' + userId , null, payload);
    }
    catch (e) {
        failureReason = "Modify user failed - request id " + requestId + ": Error updating user " + userId + ". Error message: " + e.message;
        logger.warn(failureReason);
    }
}

// Build the payload to update the request object with the final status, decision, and outcome
var decision = {'status': 'complete', 'decision': 'approved'};
if (failureReason) {
    decision.outcome = 'not provisioned';
    decision.comment = failureReason;
    decision.failure = true;
}
else {
    decision.outcome = 'provisioned';
}

// Update request
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info("Request " + requestId + " completed.");
