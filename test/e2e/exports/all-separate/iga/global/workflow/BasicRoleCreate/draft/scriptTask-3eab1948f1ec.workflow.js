logger.info('Running role create request');

var content = execution.getVariables();
var requestId = content.get('id');
var role = null;
var failureReason = null;
var roleId = null;

try {
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  if (requestObj) {
      role = requestObj.request.role;
  } else {
      failureReason = 'Governance role creation failed: Error reading request with id ' + requestId + ' requestObj: ' + requestObj;
  }
}
catch (e) {
  failureReason = 'Governance role creation failed: Error reading request with id ' + requestId + ' Error: ' + e.message;
}

if (role) {
    if (!role.object) {
        failureReason = 'Governance role creation failed: Request with id: ' + requestId + ' has no role info.';    
    }
} else {
    failureReason = 'Governance role creation failed: Request with id: ' + requestId + ' has no role object.';
}

if (!failureReason) {
  try {
    var payload = { role: {} };
    payload.role = role.object;
    if(role.glossary){
        payload.glossary = role.glossary;
    }
    payload.updateIdm = true;
    var result = openidm.action('iga/governance/role/', 'POST', payload);
    roleId = result.role.id
  }
  catch (e) {
    failureReason = 'Governance role creation failed: Error message: ' + e.message;
  }
}

if (failureReason) {
  logger.info('Governance role creation failed: ' + failureReason);
}
execution.setVariable('failureReason', failureReason);
execution.setVariable('roleId', roleId);
