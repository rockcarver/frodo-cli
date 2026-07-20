logger.info("Running entitlement grant request validation");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var applicationId = null;
var assignmentId = null;
var app = null;
var assignment = null;
var existingAccount = false;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  applicationId = requestObj.application.id;
  assignmentId = requestObj.assignment.id;
}
catch (e) {
  failureReason = "Validation failed: Error reading request with id " + requestId;
}

// Validation 1 - Check application exists
if (!failureReason && !requestObj.application.isDisconnected) {
  try {
    app = openidm.read('managed/alpha_application/' + applicationId);
    if (!app) {
      failureReason = "Validation failed: Cannot find application with id " + applicationId;
    }
  }
  catch (e) {
    failureReason = "Validation failed: Error reading application with id " + applicationId + ". Error message: " + e.message;
  }
}

// Validation 2 - Check entitlement exists
if (!failureReason && !requestObj.application.isDisconnected) {
  try {
    assignment = openidm.read('managed/alpha_assignment/' + assignmentId);
    if (!assignment) {
      failureReason = "Validation failed: Cannot find assignment with id " + assignmentId;
    }
  }
  catch (e) {
    failureReason = "Validation failed: Error reading assignment with id " + assignmentId + ". Error message: " + e.message;
  }
}

// Validation 3 - Check the user has application granted
if (!failureReason && !requestObj.application.isDisconnected) {
  try {
    var user = openidm.read('managed/alpha_user/' + requestObj.user.id, null, [ 'effectiveApplications' ]);
    user.effectiveApplications.forEach(effectiveApp => {
      if (effectiveApp._id === applicationId) {
        existingAccount = true;
      }
    })
  }
  catch (e) {
    failureReason = "Validation failed: Unable to check existing applications of user with id " + requestObj.user.id + ". Error message: " + e.message;
  }
}

// Validation 4 - If account does not exist, provision it
if (!failureReason && !requestObj.application.isDisconnected) {
  if (!existingAccount) {
    try {
      var request = requestObj.request;
      var payload = {
        "applicationId": applicationId,
        "startDate": request.common.startDate,
        "endDate": request.common.endDate,
        "auditContext": {},
        "grantType": "request"
      };
      var queryParams = {
        "_action": "add"
      }

      logger.info("Creating account: " + payload);
      var result = openidm.action('iga/governance/user/' + request.common.userId + '/applications' , 'POST', payload,queryParams);
    }
    catch (e) {
      var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = "Validation failed: Error provisioning new account to user " + request.common.userId + " for application " + applicationId + ". Error message: " + message;
    }
  }
}

if (failureReason) {
  logger.info("Validation failed: " + failureReason);
}
execution.setVariable("failureReason", failureReason);
