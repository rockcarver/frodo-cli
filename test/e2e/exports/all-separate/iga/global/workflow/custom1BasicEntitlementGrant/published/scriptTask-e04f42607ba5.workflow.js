/*
 * Script Node: Context & Type Check
 * Purpose: Reads request context and entitlement type to set routing outcomes.
 * Sets: context, waits, skipApproval, entitlementType, entitlementId, userId, failureReason, accountAttribute, authzRoleId
 */

logger.info("custom-BasicEntitlementGrant - Context & Type Check");

var content = execution.getVariables();
var requestId = content.get('id');

var context = null;
var enableWait = false;
var enableEndWait = false;
var skipApproval = false;
var entitlementType = null;
var entitlementId = null;
var userId = null;
var failureReason = null;
var accountAttribute = null;
var authzRoleId = null;

// Read request object
try {
    var requestObj = openidm.action('iga/governance/requests/' + requestId, 'GET', {}, {});

    // --- Context check ---
    if (requestObj.request.common.context) {
        context = requestObj.request.common.context.type;
        if (context == 'admin') {
            skipApproval = true;
        }
    }

    // --- Wait flags ---
    if (requestObj.request.common.startDate) {
        enableWait = true;
    }
    if (requestObj.request.common.endDate) {
        enableEndWait = true;
    }

    // --- User ---
    userId = requestObj.request.common.userId;

    // --- Entitlement ID ---
    entitlementId = requestObj.request.common.entitlementId;

    // Entitlement type
    if (entitlementId) {
        try {
            var entitlementObj = openidm.action('iga/governance/entitlement/' + entitlementId, 'GET', {}, {});
            if (entitlementObj
                && entitlementObj.glossary
                && entitlementObj.glossary.idx
                && entitlementObj.glossary.idx['/entitlement']
                && entitlementObj.glossary.idx['/entitlement'].entitlementType) {

                entitlementType = entitlementObj.glossary.idx['/entitlement'].entitlementType;

            } else {
                entitlementType = 'standard';
            }
            
			// --- authzRoleId ---
			if (entitlementObj
			   && entitlementObj.entitlement
			   && entitlementObj.entitlement._id) {

				authzRoleId = entitlementObj.entitlement._id;
				
			   }
        
            // --- accountAttribute ---
            accountAttribute = (entitlementObj
                && entitlementObj.item
                && entitlementObj.item.accountAttribute)
                ? entitlementObj.item.accountAttribute
                : null;
        } catch (e) {
            logger.warn("Entitlement lookup error: " + e.message);

            entitlementType = 'standard';
        }
    } else {
        entitlementType = 'standard';
    }

    // --- Log comment to request audit trail ---
    try {
        var logComment = "Context & Type Check"
                       + " | userId: "          + userId
                       + " | context: "         + context
                       + " | entitlementId: "   + entitlementId
                       + " | entitlementType: " + entitlementType
                       + " | skipApproval: "    + skipApproval
                       + " | authzRoleId: "     + authzRoleId;
        

        openidm.action(
            'iga/governance/requests/' + requestId,
            'POST',
            { 'comment': logComment },
            { '_action': 'update' }
        );
    } catch (e) {
        logger.error("Failed to write log comment: " + e.message);
    }

} catch (e) {
    failureReason = 'Context & Type Check failed: ' + e.message;
    logger.error(failureReason);
}

logger.info("Context: " + context + " | EntitlementType: " + entitlementType + " | UserId: " + userId);

execution.setVariable("context", context);
execution.setVariable("enableWait", enableWait);
execution.setVariable("enableEndWait", enableEndWait);
execution.setVariable("skipApproval", skipApproval);
execution.setVariable("entitlementType", entitlementType);
execution.setVariable("entitlementId", entitlementId);
execution.setVariable("userId", userId);
execution.setVariable("failureReason", failureReason);
execution.setVariable("accountAttribute", accountAttribute);
execution.setVariable("authzRoleId", authzRoleId);
