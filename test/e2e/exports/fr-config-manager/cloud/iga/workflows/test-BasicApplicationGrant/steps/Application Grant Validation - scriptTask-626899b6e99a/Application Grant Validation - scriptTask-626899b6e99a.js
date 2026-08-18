logger.info("Running application grant request validation");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var applicationId = null;
var app = null;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  applicationId = requestObj.application.id;
}
catch (e) {
  failureReason = "Validation failed: Error reading request with id " + requestId;
}

// Validation 1 - Check application exists
if (!failureReason) {
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

// Validation 2 - Check the user does not already have application granted
// Note: this is done at request submission time as well, the following is an example of how to check user's accounts
if (!failureReason) {
  try {
    var user = openidm.read('managed/alpha_user/' + requestObj.user.id, null, [ 'effectiveApplications' ]);
    user.effectiveApplications.forEach(effectiveApp => {
      if (effectiveApp._id === applicationId) {
        failureReason = "Validation failed: User with id " + requestObj.user.id + " already has effective application " + applicationId;
      }
    })
  }
  catch (e) {
    failureReason = "Validation failed: Unable to check effective applications of user with id " + requestObj.user.id + ". Error message: " + e.message;
  }
}

if (failureReason) {
  logger.info("Validation failed: " + failureReason);
}
execution.setVariable("failureReason", failureReason); 
