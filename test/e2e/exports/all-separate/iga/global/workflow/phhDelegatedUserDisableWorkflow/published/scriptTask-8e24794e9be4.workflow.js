/*
 * Validate Delegation Request
 * Validates all user inputs and delegation authority
 */

var content = execution.getVariables();
var requestId = content.get('_id');

console.log("=== Validation Start ===");

var validationPassed = false;
var validationErrors = [];
var actingPrincipalObject = null;
var targetUserObject = null;

try {
  // Get request object with form data
  var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});
  
  var requesterId = requestObj.requester.id;
  var requesterIdOnly = requesterId.replace("managed/user/", "");
  
  // Extract form values
  var actingPrincipalUsername = requestObj.request.common.blob.form.actingPrincipalId;
  var targetUserUsername = requestObj.request.common.blob.form.targetUserId;
  var justification = requestObj.request.common.blob.form.justification;
  
  console.log("Acting Principal Username: " + actingPrincipalUsername);
  console.log("Target User Username: " + targetUserUsername);
  
  // Validate acting principal
  if (!actingPrincipalUsername || actingPrincipalUsername.trim() === "") {
    validationErrors.push("Acting Principal username is required");
  } else {
    try {
      var actingPrincipalQuery = {
        "_queryFilter": 'userName eq "' + actingPrincipalUsername.trim() + '"'
      };
      var actingPrincipalResults = openidm.query("managed/alpha_user", actingPrincipalQuery);
      
      if (actingPrincipalResults.resultCount === 0) {
        validationErrors.push("Acting Principal user not found: " + actingPrincipalUsername);
      } else if (actingPrincipalResults.resultCount > 1) {
        validationErrors.push("Multiple users found with username: " + actingPrincipalUsername);
      } else {
        actingPrincipalObject = actingPrincipalResults.result[0];
        
        // Verify requester is manager of acting principal
        if (!actingPrincipalObject.manager || !actingPrincipalObject.manager._id) {
          validationErrors.push("Acting Principal does not have a manager assigned");
        } else if (actingPrincipalObject.manager._id !== requesterIdOnly) {
          validationErrors.push("You are not the manager of " + actingPrincipalUsername + ". You can only act on behalf of your direct reports.");
        } else {
          console.log("Acting Principal validated: " + actingPrincipalObject.userName);
        }
      }
    } catch (e) {
      validationErrors.push("Error validating Acting Principal: " + e.message);
    }
  }
  
  // Validate target user
  if (!targetUserUsername || targetUserUsername.trim() === "") {
    validationErrors.push("Target User username is required");
  } else {
    try {
      var targetUserQuery = {
        "_queryFilter": 'userName eq "' + targetUserUsername.trim() + '"'
      };
      var targetUserResults = openidm.query("managed/alpha_user", targetUserQuery);
      
      if (targetUserResults.resultCount === 0) {
        validationErrors.push("Target User not found: " + targetUserUsername);
      } else if (targetUserResults.resultCount > 1) {
        validationErrors.push("Multiple users found with username: " + targetUserUsername);
      } else {
        targetUserObject = targetUserResults.result[0];
        
        // Verify user type is External
        if (targetUserObject.userType !== "External") {
          validationErrors.push("Target User must be of type 'External'. User " + targetUserUsername + " is type: " + (targetUserObject.userType || "Unknown"));
        } else {
          console.log("Target User validated: " + targetUserObject.userName);
        }
      }
    } catch (e) {
      validationErrors.push("Error validating Target User: " + e.message);
    }
  }
  
  // Validate justification
  if (!justification || justification.trim() === "") {
    validationErrors.push("Justification is required");
  } else if (justification.trim().length < 10) {
    validationErrors.push("Justification must be at least 10 characters");
  }
  
  // Prevent self-disable via delegation
  if (actingPrincipalObject && targetUserObject && actingPrincipalObject._id === targetUserObject._id) {
    validationErrors.push("Cannot disable the same user you are acting on behalf of");
  }
  
  // Check if all validations passed
  if (validationErrors.length === 0) {
    validationPassed = true;
    
    // Store user details for display in approval
    execution.setVariable("actingPrincipalUserName", actingPrincipalObject.userName);
    execution.setVariable("actingPrincipalFullName", actingPrincipalObject.givenName + " " + actingPrincipalObject.sn);
    execution.setVariable("actingPrincipalId", actingPrincipalObject._id);
    
    execution.setVariable("targetUserUserName", targetUserObject.userName);
    execution.setVariable("targetUserFullName", targetUserObject.givenName + " " + targetUserObject.sn);
    execution.setVariable("targetUserId", targetUserObject._id);
    
    execution.setVariable("justification", justification);
    
    console.log("All validations passed");
  } else {
    console.log("Validation failed: " + validationErrors.join("; "));
  }
  
} catch (e) {
  validationPassed = false;
  validationErrors.push("System error during validation: " + e.message);
  console.log("Validation exception: " + e.message);
}

// Set workflow variables
execution.setVariable("validationPassed", validationPassed);
execution.setVariable("validationErrors", validationErrors.join("\n"));

console.log("=== Validation Complete: " + (validationPassed ? "PASSED" : "FAILED") + " ===");
