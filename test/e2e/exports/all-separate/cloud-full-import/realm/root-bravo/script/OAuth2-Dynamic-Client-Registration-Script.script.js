/*
 * Copyright 2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * This script is run after the following Dynamic Client Registration operations: CREATE, UPDATE, DELETE.
 *
 * Defined variables:
 * Common script bindings for next-generation scripts (1)
 * requestProperties - An unmodifiable map of the following request properties:
 *                     requestUri - The request URI.
 *                     realm - The realm that the request relates to.
 *                     requestParams - A map of the request params and/or posted data.
 *                                     Each value is a list of one or more properties.
 *                                     Please note that these should be handled in accordance with OWASP best practices:
 *                                     https://owasp.org/www-community/vulnerabilities/Unsafe_use_of_Reflection.
 *                     requestHeaders - A map of the request headers.
 *                                      Case-sensitive.
 *                     requestBody - A map representing the body of the request.
 * operation - A string to denote the dynamic client registration request operation.
 *             Possible values: CREATE, UPDATE, DELETE
 * clientIdentity - The AMIdentity that represents the created or updated OAuth2Client.
 *                  Null if the operation is DELETE.
 * softwareStatement - A map representing the decoded data of the software statement from the request.
 *                     Empty map if no software statement is provided.
 *
 * Return - no value is expected, any changes shall be made via the bindings directly.
 *
 * Reference:
 * (1) Script Bindings - https://docs.pingidentity.com/pingoneaic/latest/am-scripting/script-bindings.html
 */

// logger.info("Executing: {}", scriptName);

/*
// Example: Update the OAuth2Client identity on CREATE
// NOTE: setAttribute() overwrites the whole attribute if it exists already
if (operation === "CREATE") {
    // Read a property from the request body
    var requestBody = requestProperties.get("requestBody");
    var grantType = requestBody.get("grant_type");

    if (grantType != null) {
        var grantTypes = ["[0]=authorization_code"];
        grantTypes.push("[1]=".concat(grantType));
        clientIdentity.setAttribute( "com.forgerock.openam.oauth2provider.grantTypes", grantTypes);
        clientIdentity.store();
    };
};

// Example: Update the OAuth2Client identity on UPDATE
// NOTE: addAttribute() adds the provided value to the set if it exists already.
//       Otherwise, it sets the attribute with the single value.
if (operation === "UPDATE") {
    // Example: Read a property from the software statement
    var redirectUris = softwareStatement.get("redirect_uris");
    if (redirectUris != null) {
        var firstUri = redirectUris[0];
    };

    if (firstUri != null) {
        clientIdentity.addAttribute("com.forgerock.openam.oauth2provider.redirectionURIs", "[0]=".concat(firstUri));
        clientIdentity.store();
    };
};
*/
