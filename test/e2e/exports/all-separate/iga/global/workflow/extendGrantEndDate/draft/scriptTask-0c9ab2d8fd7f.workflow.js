logger.info("Update existing revoke request with new extended end date");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;

try {
    var extendRequest = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    if (!extendRequest || !extendRequest.request || !extendRequest.request.common) {
        throw new Error("Invalid extendRequest structure");
    }
    logger.info("extendRequestObj: " + extendRequest);

    var catalogFieldMapper = {
        "roleMembership": "roleId",
        "accountGrant": "applicationId",
        "entitlementGrant": "entitlementId"
    }
    
    var grantType = extendRequest.request.common.grantType;

    if (!catalogFieldMapper[grantType]) {
        throw new Error("Unsupported grantType: " + grantType);
    }
    var body = {
        "targetFilter": {
            "operand": [{
                "operator": "EQUALS",
                "operand": { "targetName": "decision.status", "targetValue": "suspended" }
            }, {
                "operator": "EQUALS",
                "operand": { "targetName": "request.common.userId", "targetValue": extendRequest.request.common.userId }
            }, {
                "operator": "EQUALS",
                "operand": { "targetName": "request.common." + catalogFieldMapper[grantType], "targetValue": extendRequest.request.common.grantId }
            }],
            "operator": "AND"
        }
    }
    logger.info('suspended request search body'+ JSON.stringify(body));
    var suspendedRequest = openidm.action('iga/governance/requests/search/', 'POST', body, {});
    if (suspendedRequest && suspendedRequest.result && suspendedRequest.result.length > 0) {
        var suspendedReq = suspendedRequest.result[0];
        logger.info("found existing suspendedRequest: " + suspendedReq);
    
        if (!suspendedReq.decision || !suspendedReq.decision.phases || suspendedReq.decision.phases.length === 0) {
            throw new Error("No decision phases found for suspended request " + suspendedReq.id);
        }
        
        let queryParams = {
            '_action': "changeResumeDate"
        }

        let payload = {
            "resumeDate": extendRequest.request.common.endDate
        }
     
        var updateResult = openidm.action('iga/governance/requests/' + suspendedReq.id, 'POST', payload, queryParams)
        logger.info("Successfully updated existing suspendedRequest: " + updateResult);
    } 
    else {
        // create a new revoke request with updated end date
        var newRequestPayload = {
            "common":{
                "context": {
                    "type": "admin"
                },
                "userId": extendRequest.request.common.userId,
                "endDate": extendRequest.request.common.endDate,
                "sourceRequestId": requestId,
                "justification": "Request submitted automatically to remove access granted by request: " + requestId
            }
        };
        newRequestPayload.common[catalogFieldMapper[grantType]] = extendRequest.request.common.grantId;
        logger.info("newRequestPayload" + JSON.stringify(newRequestPayload));
        var queryParam = {
            '_action': "publish"
        }
        const removeEndpoint = {
            "roleMembership": "roleRemove",
            "accountGrant": "applicationRemove",
            "entitlementGrant": "entitlementRemove"
        }
        
        var createResult = openidm.action('iga/governance/requests/'+ removeEndpoint[grantType], 'POST', newRequestPayload, queryParam)
        logger.info("Successfully created new revoke request with an end date: " + createResult);
    }

    var decision = {'outcome': 'fulfilled', 'status': 'complete'};
    var queryParams = { '_action': 'update'};
    logger.info("before updating workflow extend request" + decision);
    var updateRes = openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
    logger.info("after updating workflow extend request" + updateRes);
}
catch (e) {
    failureReason = "Update Revoke Request with extended end date failed: Error request with id " + e;
    logger.info(failureReason);
}
