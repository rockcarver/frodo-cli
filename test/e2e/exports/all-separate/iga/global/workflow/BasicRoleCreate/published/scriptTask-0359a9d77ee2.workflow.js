logger.info('Creating Governance Role');

var content = execution.getVariables();
var requestId = content.get('id');
var roleId = content.get('roleId');
var decision =  {
  'status': 'complete',
  'decision': 'approved',
  'outcome':  'fulfilled',
  'comment': 'Role ID: ' + roleId
};

var queryParams = { '_action': 'update'};
openidm.action('iga/governance/requests/' + requestId, 'POST', decision, queryParams);
logger.info('Request ' + requestId + ' completed.');
