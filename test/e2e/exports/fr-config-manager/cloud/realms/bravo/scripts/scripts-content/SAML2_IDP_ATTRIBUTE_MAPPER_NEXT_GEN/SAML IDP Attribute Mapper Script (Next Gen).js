/*
 * Copyright 2026 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * This script returns a list of SAML Attribute objects for the IDP framework to insert into the generated Assertion.
 *
 * Next-gen bindings available in this script:
 *
 * session - ScriptedSession
 *      The user's session object.
 *
 * hostedEntityId - String
 *      The entity ID of the hosted Identity Provider.
 *
 * remoteEntityId - String
 *      The entity ID of the remote Service Provider.
 *
 * realm - String
 *      The name of the realm the user is authenticating to.
 *
 * idpAttributeMapperScriptHelper - IdpAttributeMapperScriptHelper
 *      Helper object providing utility methods for IDP attribute mapping operations.
 *
 * The last line must be a JSON list containing attributes with the structure:
 * 
 * [{
 *      "name:" "...",
 *      "nameFormat": "...",
 *      "values": ["..."]
 * },...]
 * 
 */

attributes = idpAttributeMapperScriptHelper.getStandardAttributes()

// modify the attrs object as needed

attributes  // this must be the last line of the script
