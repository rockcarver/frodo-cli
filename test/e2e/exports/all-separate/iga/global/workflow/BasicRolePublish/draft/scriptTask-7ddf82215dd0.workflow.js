// Change role status to pending approval
var content = execution.getVariables();
var roleId = content.get('roleId');

try {
    var origRole = openidm.action('iga/governance/role/' + roleId + '/draft', 'GET', {}, {});
    var payload = {role: origRole.role};
    payload.role.status = 'pending';
    var result = openidm.action('iga/governance/role/' + roleId + '/draft', 'PUT', payload);
}
catch (e) {
    logger.error('Error setting role status to pending. Error message: ' + e.message);
}
