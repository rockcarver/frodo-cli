(function() {
    var content = execution.getVariables();
    var requestId = content.get('id');
    var requestIndex = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
    var userId = null;
    const grantType = requestIndex.request.common.grantType;
    if (grantType == 'roleMembership') {
        var systemSettings = openidm.action("iga/commons/config/iga_access_request", "GET", {}, {});
        if (requestIndex.roleOwner && requestIndex.roleOwner[0]) {
            userId = requestIndex.roleOwner[0].id;
        }
        else if (systemSettings && systemSettings.defaultApprover) {
            var approver = systemSettings.defaultApprover;
            return approver;
        }
    } else if (grantType == 'entitlementGrant') {
        userId = (requestIndex.entitlementOwner && requestIndex.entitlementOwner.length > 0) ? requestIndex.entitlementOwner[0].id : requestIndex.applicationOwner[0].id;
    } else if (grantType == 'accountGrant') {
        userId = requestIndex.applicationOwner[0].id
    }
    return [{
        "id": "managed/user/" + userId ,
        "permissions": {
            "approve": true,
            "reject": true,
            "reassign": true,
            "modify": true,
            "comment": true
        }
    }];
})()
