/*
 * Copyright 2022 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

/*
 * This script returns the social identity profile information for the authenticating user
 * in a standard form expected by the Social Provider Handler Node.
 *
 * Defined variables:
 * rawProfile - The social identity provider profile information for the authenticating user.
 *              JsonValue (1).
 * logger - The debug logger instance:
 *          https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 * realm - String (primitive).
 *         The name of the realm the user is authenticating to.
 * requestHeaders - TreeMap (2).
 *                  The object that provides methods for accessing headers in the login request:
 *                  https://backstage.forgerock.com/docs/am/7/authentication-guide/scripting-api-node.html#scripting-api-node-requestHeaders.
 * requestParameters - TreeMap (2).
 *                     The object that contains the authentication request parameters.
 * selectedIdp - String (primitive).
 *               The social identity provider name. For example: google.
 * sharedState - LinkedHashMap (3).
 *               The object that holds the state of the authentication tree and allows data exchange between the stateless nodes:
 *               https://backstage.forgerock.com/docs/am/7/auth-nodes/core-action.html#accessing-tree-state.
 * transientState - LinkedHashMap (3).
 *                  The object for storing sensitive information that must not leave the server unencrypted,
 *                  and that may not need to persist between authentication requests during the authentication session:
 *                  https://backstage.forgerock.com/docs/am/7/auth-nodes/core-action.html#accessing-tree-state.
 *
 * Return - a JsonValue (1).
 *          The result of the last statement in the script is returned to the server.
 *          Currently, the Immediately Invoked Function Expression (also known as Self-Executing Anonymous Function)
 *          is the last (and only) statement in this script, and its return value will become the script result.
 *          Do not use "return variable" statement outside of a function definition.
 *
 *          This script's last statement should result in a JsonValue (1) with the following keys:
 *          {
 *              {"displayName": "corresponding-social-identity-provider-value"},
 *              {"email": "corresponding-social-identity-provider-value"},
 *              {"familyName": "corresponding-social-identity-provider-value"},
 *              {"givenName": "corresponding-social-identity-provider-value"},
 *              {"id": "corresponding-social-identity-provider-value"},
 *              {"locale": "corresponding-social-identity-provider-value"},
 *              {"photoUrl": "corresponding-social-identity-provider-value"},
 *              {"username": "corresponding-social-identity-provider-value"}
 *          }
 *
 *          The consumer of this data defines which keys are required and which are optional.
 *          For example, the script associated with the Social Provider Handler Node and,
 *          ultimately, the managed object created/updated with this data
 *          will expect certain keys to be populated.
 *          In some common default configurations, the following keys are required to be not empty:
 *          username, givenName, familyName, email.
 *
 *          From RFC4517: A value of the Directory String syntax is a string of one or more
 *          arbitrary characters from the Universal Character Set (UCS).
 *          A zero-length character string is not permitted.
 *
 * (1) JsonValue - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/json/JsonValue.html.
 * (2) TreeMap - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/TreeMap.html.
 * (3) LinkedHashMap - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/LinkedHashMap.html.
 */

(function () {
    var frJava = JavaImporter(
        org.forgerock.json.JsonValue
    );

    var normalizedProfileData = frJava.JsonValue.json(frJava.JsonValue.object());
  
      //logger.message('Seguin rawProfile: '+rawProfile);

    normalizedProfileData.put('id', rawProfile.get('sub').asString());
    normalizedProfileData.put('displayName', rawProfile.get('givenName').asString() + ' ' + rawProfile.get('sn').asString());
    normalizedProfileData.put('email', rawProfile.get('mail').asString());
    normalizedProfileData.put('givenName', rawProfile.get('givenName').asString());
    normalizedProfileData.put('familyName', rawProfile.get('sn').asString());
    normalizedProfileData.put('username', rawProfile.get('upn').asString());
    normalizedProfileData.put('roles', rawProfile.get('roles').asString());
  
      //logger.message('Seguin normalizedProfileData: '+normalizedProfileData);

    return normalizedProfileData;
}());
