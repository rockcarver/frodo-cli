/*
 * Load Delegation Information
 * Populates available direct reports for the requester
 */

var content = execution.getVariables();
var requestId = content.get('_id');

console.log("=== Load Delegation Info Start ===");
console.log("Request ID: " + requestId);

try {
  // Get the request object
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  var requesterId = requestObj.requester.id;
  var requesterIdOnly = requesterId.replace("managed/user/", "");
  
  console.log("Requester ID: " + requesterIdOnly);
  
  // Query users where current user is the manager
  var queryParams = {
    "_queryFilter": 'manager._id eq "' + requesterIdOnly + '"',
    "_fields": "userName,givenName,sn,_id"
  };
  
  var results = openidm.query("managed/alpha_user", queryParams);
  
  // Build a formatted list for display
  var directReportsList = "";
  var directReportsCount = 0;
  
  if (results.resultCount > 0) {
    directReportsList = "You can act on behalf of the following users:\n\n";
    results.result.forEach(function(user) {
      directReportsList += "• " + user.userName + " (" + user.givenName + " " + user.sn + ")\n";
    });
    directReportsCount = results.resultCount;
    logger.info("Found " + directReportsCount + " direct reports");
  } else {
    directReportsList = "You do not have any direct reports in the system.\n\nYou cannot submit delegation requests without direct reports.";
    logger.warn("No direct reports found");
  }
  
  // Store variables for later use
  execution.setVariable("directReportsList", directReportsList);
  execution.setVariable("directReportsCount", directReportsCount);
  execution.setVariable("hasDelegationAuthority", directReportsCount > 0);
  
  // Update the request to populate the helper field
  // This updates the form display for the user
  var updatePayload = {
    "request": {
      "common": {
        "blob": {
          "form": {
            "availableDirectReports": directReportsList
          }
        }
      }
    }
  };
  
  openidm.patch('iga/governance/requests/' + requestId, null, [
    {
      "operation": "add",
      "field": "/request/common/blob/form/availableDirectReports",
      "value": directReportsList
    }
  ]);
  
  console.log("Direct reports list populated in form");
  
} catch (e) {
  logger.error("Error loading delegation info: " + e.message);
  execution.setVariable("hasDelegationAuthority", false);
  execution.setVariable("directReportsCount", 0);
  execution.setVariable("directReportsList", "Error loading your direct reports. Please contact your administrator.");
}

console.log("=== Load Delegation Info Complete ===");
