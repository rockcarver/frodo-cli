logger.info("Create Removal Request");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  logger.info("requestObj: " + requestObj);
}
catch (e) {
  failureReason = "Create Removal Request failed: Error reading request with id " + requestId;
}

if(!failureReason){
    try{
        var request = requestObj.request;
        var newRequestPayload = {
            "common":{
                "context": {
                    "type": "admin"
                },
                "entitlementId": request.common.entitlementId,
                "userId": request.common.userId,
                "endDate": request.common.endDate,
                "sourceRequestId": requestId,
                "justification": "Request submitted automatically to remove access granted by request: " + requestId
            }
        };
        var queryParam = {
            '_action': "publish"
        }
        openidm.action('iga/governance/requests/entitlementRemove', 'POST', newRequestPayload, queryParam)
    }catch(e){
        logger.warn('Create Removal Request failed to create')
    }
    }
