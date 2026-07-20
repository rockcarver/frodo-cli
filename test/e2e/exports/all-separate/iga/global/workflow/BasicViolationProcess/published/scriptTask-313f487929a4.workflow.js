logger.info("Allowing violation");
var content = execution.getVariables();
var violationId = content.get('id');
var phaseName = content.get('phaseName');
logger.info("Violation to be allowed: " + violationId + " with phase name " + phaseName);

var failureReason = null;
try {
    var allowResponse = openidm.action('iga/governance/violation/' + violationId + '/allow', 'POST', {});
logger.info("Violation " + violationId + " was allowed successfully.");} catch (e) {
    var err = e.javaException; 
        err = JSON.parse(err.detail);
        var message = err && err.body ? err.body.response : e.message;
        failureReason = "Failed allowing violation with id " + violationId + ". Error message: " + message;
}

if (failureReason) {
    var update = { "comment": failureReason };
    try {
        openidm.action('iga/governance/violation/' + violationId + '/phases/' + phaseName + '/comment', 'POST', update, {});   
    } catch (e) {
        openidm.action('iga/governance/violation/' + violationId + '/comment', 'POST', update, {});
    }
}
