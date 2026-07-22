/*
 * Auto-Reject - No Delegation Authority
 * Rejects request if user has no direct reports
 */

var content = execution.getVariables();
var requestId = content.get('_id');

console.log("Auto-rejecting request " + requestId + " - no delegation authority");

try {
  var decision = {
    'decision': 'rejected',
    'status': 'complete',
    'comment': 'Request automatically rejected: You do not have any direct reports in the system. You cannot submit delegation requests without having direct reports assigned to you.\n\nPlease contact your administrator if you believe this is an error.'
  };
  
  var updateParams = {
    '_action': 'update'
  };
  
  openidm.action('iga/governance/requests/' + requestId, 'POST', decision, updateParams);
  
  console.log("Request " + requestId + " rejected successfully");
  
} catch (e) {
  console.log("Error rejecting request: " + e.message);
  throw e;
}
