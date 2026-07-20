// Change role status to back to draft
var content = execution.getVariables();
var roleId = content.get('roleId');

try {
    var origRole = openidm.action('iga/governance/role/' + roleId + '/pending', 'GET', {}, {});
    var payload = {role: origRole.role};
    payload.role.status = 'draft';
    var result = openidm.action('iga/governance/role/' + roleId + '/pending', 'PUT', payload);
}
catch (e) {
    logger.error('Error setting role status to draft. Error message: ' + e.message);
}
