var content = execution.getVariables();
var requestId = content.get('id');
var context = null;
var enableWait = false;
var enableEndWait = false;
var skipApproval = false;
try {
    // Read request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    if (requestObj.request.common.context) {
        context = requestObj.request.common.context.type;
        if (context == 'admin') {
            skipApproval = true;
        }
    }
    if (requestObj.request.common.startDate){
        enableWait = true;
    }
    if (requestObj.request.common.endDate){
        enableEndWait = true;
    }
}
catch (e) {
    logger.info("Request Context Check failed " + e.message);
}
logger.info("Context: " + context);
execution.setVariable("context", context);
execution.setVariable("enableWait", enableWait);
execution.setVariable("enableEndWait", enableEndWait);
execution.setVariable("skipApproval", skipApproval);
