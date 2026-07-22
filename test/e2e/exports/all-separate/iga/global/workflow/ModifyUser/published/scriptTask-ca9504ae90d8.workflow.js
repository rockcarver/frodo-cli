// This permission check script will check that the requester has proper privileges to
// modify the user for which they are requesting.  If so, it will
// skip any approval process and directly move to modify the user.

var content = execution.getVariables();
var requestId = content.get('id');
logger.info("Modify User - Permission check - request id " + requestId);
var skipApproval = false;

try {
    // Read the request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    var requester = requestObj.requester
    
    if(requester.id.startsWith('managed/user/')){
        // If requester is a managed user, check that the user has permissions to 
        var userId = requestObj.request.user.userId;
        var requesterId = requester.id.split('/');
        var userResponse = openidm.action('iga/governance/user/', 'GET', {}, {'endUserId': requesterId[2], 'scopePermission': 'modifyUser', '_queryFilter': `id+eq+'` + userId + `'`})
        if(userResponse.result[0].permissions.modifyUser){
            skipApproval = true;
        }
    }
    else{
      // Tenant admins and system requests
      skipApproval = true;
    }
}
catch (e) {
  logger.info("Request permission check failed - request id " + requestId + ": " + e.message);
}

execution.setVariable("skipApproval", skipApproval);
