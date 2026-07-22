logger.info('Deleting Governance Role');

var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = content.get('failureReason');
var decision = {};
var request = null;

if(!failureReason) {
    try {
        var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
        logger.info('requestObj: ' + requestObj);
        request = requestObj.request;
    }
    catch (e) {
        failureReason = 'Governance role deletion failed: Error reading request with id ' + requestId;
    }
    
    if(!failureReason) {
        try {
            openidm.action('iga/governance/role/' + request.role.roleId + '/' + request.role.status, 'DELETE', {}, {});
        }
        catch (e) {
          failureReason = 'Governance role deletion failed: Error deleting role ' + request.role.roleId + ', status: ' + request.role.status + '. Error message: ' + e.message;
        }

      decision = {
          'status': 'complete',
          'decision': 'approved',
          'outcome':  'fulfilled'
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
    logger.info('Delete failed: ' + failureReason);
}

var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info('Request ' + requestId + ' completed.');
