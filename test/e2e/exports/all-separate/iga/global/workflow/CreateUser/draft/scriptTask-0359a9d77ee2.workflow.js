logger.info("Creating User");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
}
catch (e) {
  failureReason = "Creating User: Error reading request with id " + requestId;
}

if(!failureReason) {
  try {
    var payload = requestObj.request.user.object;

    /** Create new user **/
    var result = openidm.create('managed/alpha_user', null, payload, queryParams);
    logger.info("User created with userName " + result.userName + " and _id " + result._id + ".")
      
    /** Send new user email **/
    var body = { 
        subject: "Welcome " + payload.givenName + " " + payload.sn + "!",
        to: payload.mail,
        body: "Your new user has been created.\n\nUsername: " + payload.userName,
        object: {}
    };
      
    if(payload.manager && payload.manager._ref){
        logger.info("Getting manager information for " + payload.userName + " create user welcome email.")
        try {
            var managerResult = openidm.read(payload.manager._ref);
            body.cc = managerResult.mail;
          } catch (e) {
            logger.info("Unable to read manager information for " + payload.userName + " create user welcome email. " + e.message)
        }
    }
    openidm.action("external/email", "send", body);
  }
  catch (e) {
    failureReason = "Creating user failed: Error during creation of user " + payload.userName + ". Error message: " + e.message;
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
