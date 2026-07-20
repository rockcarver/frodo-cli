// This permission check script will check that the requester has proper privileges to
// create an entitlement for the application which they are requesting.  If so, it will
// skip any approval process and directly move to create the entitlement.

logger.info("Creating Entitlement - Permission check");
var content = execution.getVariables();
var requestId = content.get('id');
var skipApproval = false;

try {
    // Read the request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    var requester = requestObj.requester
  
    if(requester.id.startsWith('managed/user/')){
        // If requester is a managed user, check that the user has permissions to 
        // create entitlements for the requested application
        var entitlementObj = requestObj.request.entitlement;
        var userId = requester.id.split('/')
        var entitlement = openidm.action('iga/governance/application/' + entitlementObj.applicationId, 'GET', {}, {'endUserId': userId[2]})
        if (entitlement.permissions.createEntitlement) {
            skipApproval = true;
        }
    }
    else {
      // Tenant admins and system requests
      skipApproval = true;
    }
}
catch (e) {
  logger.info("Request permission check failed: " + e.message);
}

execution.setVariable("skipApproval", skipApproval);
