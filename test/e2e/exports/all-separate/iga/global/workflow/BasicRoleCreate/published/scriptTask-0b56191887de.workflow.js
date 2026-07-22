var content = execution.getVariables();
var requestId = content.get('id');
var failureReason = content.get('failureReason');

var decision = {'outcome': 'cancelled', 'status': 'complete', 'comment': failureReason, 'failure': true, 'decision': 'rejected'};
var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
