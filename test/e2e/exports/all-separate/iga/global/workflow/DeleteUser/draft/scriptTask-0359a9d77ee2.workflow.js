var content = execution.getVariables();
var requestId = content.get('id');
logger.info("Deleting User - request id " + requestId);
var failureReason = null;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
}
catch (e) {
  failureReason = "User Deletion: Error reading request with id " + requestId;
}

if(!failureReason) {
  try {
    var request = requestObj.request;
      
    /** Delete user **/
    var result = openidm.delete('managed/alpha_user/' + request.user.userId, null);
    logger.info("Deleted user " + request.user.userId + " for request id " + requestId + ".")
  }
  catch (e) {
    failureReason = "Deleting user failed: Error during deletion of user " + request.user.userId + " for request id " + requestId + ". Error message: " + e.message;
  }
  
  var decision = {'status': 'complete', 'decision': 'approved'};
  if (failureReason) {
    decision.outcome = 'not provisioned';
    decision.comment = failureReason;
    decision.failure = true;
  }
  else {
    decision.outcome = 'provisioned';
  }

  var queryParams = { '_action': 'update'};
  openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
  logger.info("Request " + requestId + " completed.");
}
