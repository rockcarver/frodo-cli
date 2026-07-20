// This permission check script will check that the requester has proper privileges to
// modify the entitlement for which they are requesting.  If so, it will
// skip any approval process and directly move to modify the entitlement.

logger.info("Modify Entitlement - Permission check");
var content = execution.getVariables();
var requestId = content.get('id');
var isCertifierOwnerSame = String(content.get('isCertifierOwnerSame')) === 'true';
var skipApproval = true;

try {
    // Read the request object
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    var requester = requestObj.requester
    
    if(requester.id.startsWith('managed/user/')){
        // If requester is a managed user, check that the user has permissions to 
        // create entitlements for the requested application
        var entitlementObj = requestObj.request.entitlement;
        var userId = requester.id.split('/');
        var entitlement = openidm.action('iga/governance/entitlement/' + entitlementObj.entitlementId, 'GET', {}, {'endUserId': userId[2]})
        if(!entitlement.permissions.modifyEntitlement || !isCertifierOwnerSame){
            skipApproval = false;
        }
    } 
    if (requestObj.request.common.context) {
        context = requestObj.request.common.context.type;
        if (context == 'certification' && !isCertifierOwnerSame) {
            skipApproval = false;
        }
    }
}
catch (e) {
  logger.info("Request permission check failed: " + e.message);
}

execution.setVariable("skipApproval", skipApproval);
