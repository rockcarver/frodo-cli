logger.info("Create User - rejecting request");

var content = execution.getVariables();
var requestId = content.get('id');

var requestIndex = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
var decision = {'outcome': 'denied', 'status': 'complete', 'decision': 'rejected'};
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
