var content = execution.getVariables();
var requestId = content.get('id');
var context = null;
var skipApproval = false;
var lineItemId = null;
var campaignId = null;
var enableWait = false;

try {
    // Read request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    if (requestObj.request.common.context) {
        // Set execution variables from the request context
        context = requestObj.request.common.context.type;
        if (context == 'admin' || context == 'certification') {
            skipApproval = true;
        }
        if (context == 'certification') {
            lineItemId = requestObj.request.common.context.lineItemId;
            campaignId = requestObj.request.common.context.campaignId

            // Add a comment on the certification item denoting the request ID
            var commentResp = openidm.action('/iga/governance/certification/' + campaignId + '/items/comment', 'POST', { "ids": [lineItemId], "comment": "ID of entitlement removal request: " + requestId }, {})
        }

    }
    if (requestObj.request.common.endDate){
        enableWait = true;
    }
}
catch (e) {
    logger.info("Could not validate request context, normal approval process will be followed.")
}

logger.info("Context: " + context);
execution.setVariable("context", context);
execution.setVariable("lineItemId", lineItemId);
execution.setVariable("enableWait", enableWait);
execution.setVariable("skipApproval", skipApproval);
