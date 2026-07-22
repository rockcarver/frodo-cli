/*
 * Load Delegate Sources
 * Queries users the current requester can act on behalf of
 */

var content = execution.getVariables();
var requestId = content.get('_id');

try {
  // Get the request to find requester
  var requestObj = openidm.read('iga/governance/requests/' + requestId);
  var requesterId = requestObj.requester.id;
  var requesterIdOnly = requesterId.replace("managed/user/", "");
  
  console.log("=== Loading Delegation Options ===");
  console.log("Requester ID: " + requesterIdOnly);
  
  // Query users where current user is the manager
  var queryParams = {
    "_queryFilter": 'manager._id eq "' + requesterIdOnly + '"',
    "_fields": "userName,givenName,sn,mail,_id"
  };
  
  var results = openidm.query("managed/alpha_user", queryParams);
    console.log("Results: " + results);
  
  // Build options array
  var options = [];
  
  if (results.resultCount > 0) {
    results.result.forEach(function(user) {
      options.push({
        "value": user._id,
        "label": user.givenName + " " + user.sn + " (" + user.userName + ")"
      });
    });
    
    logger.info("Found " + options.length + " delegation options");
  } else {
    logger.warn("No direct reports found for requester");
    options.push({
      "value": "",
      "label": "No direct reports found"
    });
  }
  
  // Store options as JSON string
  execution.setVariable("delegationOptions", JSON.stringify(options));
  execution.setVariable("hasDelegationOptions", results.resultCount > 0);
  execution.setVariable("delegationOptionsCount", results.resultCount);
  
} catch (e) {
  logger.error("Error loading delegation options: " + e.message);
  execution.setVariable("delegationOptions", "[]");
  execution.setVariable("hasDelegationOptions", false);
  execution.setVariable("delegationOptionsCount", 0);
}

logger.info("=== Delegation Options Loaded ===");
