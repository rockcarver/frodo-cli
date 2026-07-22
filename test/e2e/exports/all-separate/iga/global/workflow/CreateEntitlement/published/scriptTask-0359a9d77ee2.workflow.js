logger.info("Create Entitlement - creating entitlement");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;

try {
    // Read request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    logger.info("requestObj: " + requestObj);
}
catch (e) {
    failureReason = "Create entitlement failed: Error reading request with id " + requestId;
}

if(!failureReason) {
    try {
        // Call IGA API for creating entitlement
        var payload = requestObj.request.entitlement;
        var params = { '_action': 'create', 'initiatingUser': requestObj.requester.id};
        openidm.action('iga/governance/entitlement', 'POST', payload, params);
    }
    catch (e) {
        var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = "Create entitlement failed: Error creating " + payload.objectType + " entitlement for application " + payload.applicationId + ". Error message: " + message;
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
