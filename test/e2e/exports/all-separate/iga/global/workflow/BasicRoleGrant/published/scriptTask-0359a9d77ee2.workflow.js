logger.info("Provisioning");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  logger.info("requestObj: " + requestObj);
}
catch (e) {
  failureReason = "Provisioning failed: Error reading request with id " + requestId;
}

if(!failureReason) {
  try {
    var request = requestObj.request;
    var payload = {
      "roleId": request.common.roleId,
      "auditContext": {},
      "grantType": "request",
      "requestId": requestObj.id,
    };
    var queryParams = {
      "_action": "add",
      "initiatingUser": requestObj.requester.id
    }

    var result = openidm.action('iga/governance/user/' + request.common.userId + '/roles' , 'POST', payload,queryParams);
  }
  catch (e) {
    var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = "Provisioning failed: Error provisioning role to user " + request.common.userId + " for role " + request.common.roleId + ". Error message: " + message;
  }
  
  var decision = {'status': 'complete', 'decision': 'approved'};
  if (failureReason) {
    decision.outcome = 'not provisioned';
    decision.comment = failureReason;
    decision.failure = true;
    execution.setVariable('enableEndWait', false);
  }
  else {
    decision.outcome = 'provisioned';
  }

  var queryParams = { '_action': 'update'};
  openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
  logger.info("Request " + requestId + " completed.");
}
