/*
 * Fulfillment - Disable User Account
 * Disables the target user's account
 */

var content = execution.getVariables();
var requestId = content.get('_id');
var targetUserId = content.get('targetUserId');
var justification = content.get('justification');
var actingPrincipalUserName = content.get('actingPrincipalUserName');

console.log("=== Fulfillment Start ===");
console.log("Disabling user ID: " + targetUserId);

try {
  // Read current user state
  var targetUser = openidm.read("managed/alpha_user/" + targetUserId);
  
  if (!targetUser) {
    throw new Error("Target user not found: " + targetUserId);
  }
  
  console.log("Current user status: " + (targetUser.accountStatus || "active"));
  
  // Prepare patch operations to disable the account
  var patchOperations = [
    {
      "operation": "replace",
      "field": "/accountStatus",
      "value": "inactive"
    }
  ];
  
  // Add a description/note about the disable action
  if (targetUser.description) {
    patchOperations.push({
      "operation": "replace",
      "field": "/description",
      "value": targetUser.description + "\n[" + new Date().toISOString() + "] Disabled via delegation by " + actingPrincipalUserName + ". Reason: " + justification
    });
  } else {
    patchOperations.push({
      "operation": "add",
      "field": "/description",
      "value": "[" + new Date().toISOString() + "] Disabled via delegation by " + actingPrincipalUserName + ". Reason: " + justification
    });
  }
  
  // Execute the patch
  var updateResult = openidm.patch("managed/alpha_user/" + targetUserId, null, patchOperations);
  
  console.log("User " + targetUser.userName + " successfully disabled");
  console.log("Account status set to: inactive");
  
  // Set success variables
  execution.setVariable("fulfillmentStatus", "completed");
  execution.setVariable("fulfillmentMessage", "User account " + targetUser.userName + " has been successfully disabled");
  
  // Update request with completion details
  try {
    var requestUpdate = {
      'status': 'complete',
      'decision': 'approved'
    };
    
    openidm.action('iga/governance/requests/' + requestId, 'POST', requestUpdate, {'_action': 'update'});
  } catch (updateError) {
    console.log("Could not update request status: " + updateError.message);
  }
  
} catch (e) {
  logger.error("Fulfillment error: " + e.message);
  execution.setVariable("fulfillmentStatus", "failed");
  execution.setVariable("fulfillmentMessage", "Error disabling user: " + e.message);
  
  // Don't throw - let workflow complete but mark as failed
  // You might want to send a notification here
}

console.log("=== Fulfillment Complete ===");
