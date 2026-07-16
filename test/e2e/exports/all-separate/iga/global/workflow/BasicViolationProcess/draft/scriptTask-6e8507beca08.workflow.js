logger.info("Removing grants automatically");

var content = execution.getVariables();
var violationId = content.get('id');
var failureReason = null;
var phaseName = content.get('phaseName');
var violationObj;

logger.info("Removing grants for violation " + violationId + " with phase name " + phaseName);

try {
  violationObj = openidm.action('iga/governance/violation/lookup/' + violationId, 'GET', {}, {});
}
catch (e) {
  failureReason = "Removing grants failed: Error reading violation with id " + violationId + ". Error message: " + e.message;
}

if (!failureReason) {
  var remediation = violationObj.decision.remediation;
  var failedDeprovisioning = false;
  var deprovisionedIds = [];
  for(var grant of violationObj.violatingAccess) {
    if (!remediation.grantIds.includes(grant.compositeId)) {
      continue;
    }

    var userId = violationObj.user.id;
    logger.info("Removing grant: " + grant.compositeId + ", user: " + userId + ", violation: " + violationId + ", type: " + grant.item.type);
    var resourceInfo;
    var resourcePath;
    if (grant.item.type === 'ResourceGrant' || grant.item.type === 'entitlementGrant') {
      resourceInfo = { "resourceKey": "entitlementId", "resourceValue": grant.assignment.id };
      resourcePath = "entitlements";
    }
    else if (grant.item.type === 'AccountGrant' || grant.item.type === 'accountGrant') {
      var accountId = grant.account.id;
          
    }
    else if (grant.item.type === 'roleMembership') {
      resourceInfo = { "resourceKey": "roleId", "resourceValue": grant.role.id };
      resourcePath = "roles";
    }

    try {
      var payload = {
        "grantType": "request"
      };
      payload[resourceInfo.resourceKey] = resourceInfo.resourceValue;

      logger.info('Payload to remove grant: ' + JSON.stringify(payload));
      
      var queryParams = {
        "_action": "remove"
      }

      var result = openidm.action('iga/governance/user/' + userId + '/' + resourcePath , 'POST', payload,queryParams);
      execution.setVariables(result);

      logger.info("Grant removed " + grant.compositeId + " successfully, user " + userId + ", violation: " + violationId + ", type: " + grant.item.type + ", resource info: " + JSON.stringify(resourceInfo) + ", result: " + JSON.stringify(result));
      deprovisionedIds.push(grant.compositeId);
    }
    catch (e) {
      var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = failureReason + ". Removing grants failed: Error deprovisioning " + resourcePath + " to user " + userId + " for " + resourceInfo + ". Error message: " + message + ".";
      failedDeprovisioning = true;
    }
  }

  if (!failedDeprovisioning) {
    openidm.action('iga/governance/violation/' + violationId + '/remediation/status/complete', 'POST', {});
  } else {
    failureReason = failureReason + ". Grants removed: " + deprovisionedIds;
  }
}

if (failureReason) {
  var update = { 'comment': failureReason };
  try {
    openidm.action('iga/governance/violation/' + violationId + '/phases/' + phaseName + '/comment', 'POST', update, {});   
  } catch (e) {
    openidm.action('iga/governance/violation/' + violationId + '/comment', 'POST', update, {});
  }
}
