logger.info("Remediating violation");

var content = execution.getVariables();
var violationId = content.get('id');
var remediation = content.get('remediation');
logger.info("Remediating violation - violationId: " + violationId + ', remediation payload: ' + remediation);

var remediationContent = null;

var remediationResponse = openidm.action('iga/governance/violation/' + violationId + '/remediate', 'POST', remediation);
logger.info("Remediating response: " + remediationResponse);

remediationContent = remediationResponse.decision.remediation;
execution.setVariable("remediation", remediationContent); 
