var content = execution.getVariables();
var requestId = content.get('id');
var requestObj = null;
var entId = null;
var entGlossary = null;
var entPriv = null;

//Check entitlement exists and grab entitlement info
try {
  requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  entId = requestObj.assignment.id;
}
catch (e) {
  logger.info("Validation failed: Error reading entitlement grant request with id " + requestId);
}
//Check glossary for entitlement exists and grab glossary info
try {
  entGlossary = openidm.action('iga/governance/resource/' + entId + '/glossary', 'GET', {}, {});
  // Sets entPriv based on the glossary contents, if present, otherwise defaults to true
  entPriv = (entGlossary.hasOwnProperty("isPrivileged")) ? entGlossary.isPrivileged : true;
  //Sets entPriv based on glossary contents, if present, otherwise defaults to false
  //entPriv = !!entGlossary.isPrivileged;
  execution.setVariable("entPriv", entPriv);
}
catch (e) {
  logger.info("Could not retrieve glossary with entId " + entId + " from entitlement grant request ID " + requestId);
}
