// This permission check script will check that the requester has proper privileges to
// delete users.  If so, it will skip any approval process and directly move to delete the user.

logger.info("Delete User - Permission check");
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
        var userId = requestObj.request.user.userId;
        var requesterId = requester.id.split('/');
        var user = openidm.action('iga/governance/user', 'GET', {}, {'endUserId': requesterId[2], 'scopePermission': 'deleteUser', '_queryFilter': `id+eq+'` + userId + `'`})
        if(user.result[0].permissions.deleteUser){
            skipApproval = true;
        }
    }
    else{
      // Tenant admins and system requests
      skipApproval = true;
    }
}
catch (e) {
  logger.info("Request permission check failed: " + e.message);
}

execution.setVariable("skipApproval", skipApproval);
