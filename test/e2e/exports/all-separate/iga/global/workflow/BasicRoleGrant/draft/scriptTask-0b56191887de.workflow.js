var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = content.get('failureReason');

var decision = {'outcome': 'not provisioned', 'status': 'complete', 'comment': failureReason, 'failure': true, 'decision': 'approved'};
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
