logger.info('Modifying Governance Role');

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = content.get('failureReason');
var comment = content.get('comment');
var decision = {};
var request = null;

if(!failureReason) {
    try {
      var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
      logger.info('requestObj: ' + requestObj);
      request = requestObj.request;
    }
    catch (e) {
      failureReason = 'Governance role modification failed: Error reading request with id ' + requestId;
    }
    
    if(!failureReason) {
      try {
        var payload = {};
        payload.role = request.role.object;
        payload.role.status = request.role.status;
        if(request.role.glossary){
            payload.glossary = request.role.glossary;
        }
        var result = openidm.action('iga/governance/role/' + request.role.roleId + '/' + request.role.status, 'PUT', payload);
      }
      catch (e) {
        failureReason = 'Governance role modification failed: Error modifying role ' + request.role.roleId + ', status: ' + request.role.status + '. Error message: ' + e.message;
      }

      decision = {
          'status': 'complete',
          'decision': 'approved',
          'outcome':  'fulfilled',
          'comment': comment
      };
    }
}

if(failureReason) {
    decision = {
        'status': 'complete',
        'decision': 'approved',
        'outcome': 'cancelled',
        'failure': true,
        'comment': failureReason
    };
    logger.info('Modifying failed: ' + failureReason);
}

var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info('Request ' + requestId + ' completed.');
