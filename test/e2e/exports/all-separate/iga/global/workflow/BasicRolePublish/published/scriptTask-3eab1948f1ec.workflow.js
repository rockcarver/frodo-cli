logger.info('Running governance role publish request validation');

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = null;
var roleId = null;
var updateIdm = true;
var addAutoRoleMembers = true;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  if (requestObj) {
      roleId = requestObj.request.role.roleId;
      addAutoRoleMembers = requestObj.request.role.addAutoRoleMembers ? requestObj.request.role.addAutoRoleMembers: true;
      updateIdm = requestObj.request.role.updateIdm ? requestObj.request.role.updateIdm : true;
  } else {
      failureReason = 'Validation failed: Error reading request with id ' + requestId + ' requestObj: ' + requestObj;
  }
}
catch (e) {
  failureReason = 'Validation failed: Error reading request with id ' + requestId + ' Error: ' + e.message;
}

// Validation - Check role and role owner exists
if (!failureReason) {
  try {
    var role = openidm.action('iga/governance/role/' + roleId + '/draft', 'GET', {}, {});
    if (!role) {
      failureReason = 'Validation failed: Cannot find role with id ' + roleId + ', status: draft';
    } else {
        try {
            execution.setVariable('roleOwner', role.glossary.idx['/role'].roleOwner);
        } catch(e) { 
            failureReason = 'Validation failed: No role owner set for role with id ' + roleId + ', status: draft';
        }
    }
  }
  catch (e) {
    failureReason = 'Validation failed: Error reading role with id ' + roleId + ', status: draft' + '. Error message: ' + e.message + 'role: ' + role;
  }
}

if (failureReason) {
  logger.info('Validation failed: ' + failureReason);
}
execution.setVariable('failureReason', failureReason);
execution.setVariable('roleId', roleId);
execution.setVariable('updateIdm', updateIdm);
execution.setVariable('addAutoRoleMembers', addAutoRoleMembers);
