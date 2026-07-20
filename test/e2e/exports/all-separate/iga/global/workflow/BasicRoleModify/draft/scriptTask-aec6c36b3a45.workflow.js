logger.info('Rejecting request');

var content = execution.getVariables();
var requestId = content.get('id');

logger.info('Execution Content: ' + content);

var decision = {'outcome': 'denied', 'status': 'complete', 'decision': 'rejected'};
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
