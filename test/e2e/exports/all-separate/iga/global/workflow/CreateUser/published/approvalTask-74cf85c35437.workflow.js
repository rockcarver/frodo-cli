(function() {
    var systemSettings = openidm.action('iga/commons/config/iga_access_request', 'GET', {}, {});
    return systemSettings.defaultApprover;
})()
