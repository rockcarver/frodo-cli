/*
 * Copyright 2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * This script returns the user's distinguished name or the universal ID for the corresponding SAML Assertion.
 *
 * Defined variables:
 * hostedEntityId - String (primitive).
 *      The hosted entity ID.
 * assertion - Map
 *      Map of the SAML Assertion.
 * realm - String (primitive).
 *      The name of the realm the user is authenticating to.
 * accountMapperHelper - SpAccountMapperScriptHelper
 *      An SpAccountMapperScriptHelper instance containing convenience methods used for SP account mapping.
 *
 * Return - a String containing the user's distinguished name or the universal ID. Return null if no user can be mapped.
 *
 * Example return values:
 *      "uid=jdoe,ou=people,dc=example,dc=com" - the SP user's distinguished name
 *      "jdoe" - the SP user's universal ID
 *      null - no user has been mapped thus requiring the user to enter their SP credentials
 *      "prefix-" + nameID["value"] - the NameID value with a hardcoded prefix of "prefix-"
 */

/**
 * Default SAML2 SP Account Mapper.
 */
function getIdentity() {
    const debugMethod = "ScriptedSPAccountMapper.getIdentity:: ";

    var nameID = accountMapperHelper.getNameID();

    var userID = null;
    var isTransient = accountMapperHelper.isTransientNameId(nameID["format"]);
    if (isTransient) {
        userID = accountMapperHelper.getTransientUserForSP();
        accountMapperHelper.validateUserId(userID);
    }

    if (userID != null && userID.length > 0) {
        logger.debug(debugMethod + " use Transient user as userID:" + userID);
        return userID;
    }

    userID = accountMapperHelper.getAutoFedUser(nameID["value"]);
    if (userID != null && userID.length > 0) {
        logger.debug(debugMethod + " use AutoFedUser as userID:" + userID);
        return userID;
    } else {
        if (accountMapperHelper.useNameIDAsSPUserID() && !accountMapperHelper.isAutoFedEnabled()) {
            logger.debug(debugMethod + " use NameID value as userID:" + nameID["value"]);
            accountMapperHelper.validateUserId(nameID["value"]);
            return nameID["value"];
        } else {
            return null;
        }
    }
}

getIdentity();
