(function() {
var content = execution.getVariables();
var requestId = content.get('id');
var requestIndex = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
var approverId = '';
if (requestIndex.request.common.blob.after.manager) { approverId = requestIndex.request.common.blob.after.manager.id }
return [{
"id": "managed/user/" + approverId,
"permissions": {
"approve": true,
"reject": true,
"reassign": true,
"modify": true,
"comment": true
}
}];
})()
