logger.info("Running role grant request validation");

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var roleId = null;
var role = null;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  roleId = requestObj.role.id;
}
catch (e) {
  failureReason = "Validation failed: Error reading request with id " + requestId;
}

// Validation 1 - Check role exists
if (!failureReason) {
  try {
    role = openidm.read('managed/alpha_role/' + roleId);
    if (!role) {
      failureReason = "Validation failed: Cannot find role with id " + roleId;
    }
  }
  catch (e) {
    failureReason = "Validation failed: Error reading role with id " + roleId + ". Error message: " + e.message;
  }
}

if (failureReason) {
  logger.info("Validation failed: " + failureReason);
}
execution.setVariable("failureReason", failureReason); 
