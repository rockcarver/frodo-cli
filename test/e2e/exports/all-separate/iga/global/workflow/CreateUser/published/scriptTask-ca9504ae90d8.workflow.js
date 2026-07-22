// This permission check script will check that the requester has proper privileges to
// create a user.  If so, it will skip any approval process and directly move to create the new user.

logger.info("Create User - Permission check");
var content = execution.getVariables();
var requestId = content.get('id');
var skipApproval = false;

try {
    // Read the request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    var requester = requestObj.requester
    
    if(requester.id.startsWith('managed/user/')){
        // If requester is a normal managed user, check that the user has permissions to create a user
        var userId = requester.id.split('/');
        var user = openidm.action('iga/governance/user', 'GET', {}, {'endUserId': userId[2], 'scopePermission': 'createUser', '_queryFilter': `id+eq+'` + userId[2] + `'`})
        if(user.result.length > 0){
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
