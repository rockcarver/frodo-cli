/*
 * Auto-Reject - Validation Failed
 * Rejects request with detailed error messages
 */

var content = execution.getVariables();
var requestId = content.get('_id');
var validationErrors = content.get('validationErrors') || "Validation failed";

console.log("Auto-rejecting request due to validation errors");

try {
  var decision = {
    'decision': 'rejected',
    'status': 'complete',
    'comment': 'Request automatically rejected due to validation errors:\n\n' + validationErrors + '\n\nPlease correct the errors and submit a new request.'
  };
  
  var updateParams = {
    '_action': 'update'
  };
  
  openidm.action('iga/governance/requests/' + requestId, 'POST', decision, updateParams);
  
  console.log("Request " + requestId + " rejected - validation failed");
  
} catch (e) {
  console.log("Error rejecting request: " + e.message);
  throw e;
}
