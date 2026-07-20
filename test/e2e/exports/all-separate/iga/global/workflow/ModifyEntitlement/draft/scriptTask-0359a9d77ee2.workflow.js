logger.info("Modify Entitlement - updating entitlement");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var entitlementId = null;

try {
    // Read request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    entitlementId = requestObj.request.entitlement.entitlementId;
    logger.info("requestObj: " + requestObj);
}
catch (e) {
    failureReason = "Modify entitlement failed: Error reading request with id " + requestId;
}

if(!failureReason) {
    try {
        // Call IGA API for modifying entitlement
        var payload = requestObj.request.entitlement;
        var queryParams = {
          "_action": "update",
          "initiatingUser": requestObj.requester.id
        }

        var result = openidm.action('iga/governance/entitlement/' + entitlementId , 'PUT', payload, queryParams);
    }
    catch (e) {
        var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = "Modify entitlement failed: Error updating entitlement " + payload.entitlementId + ". Error message: " + message;
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
