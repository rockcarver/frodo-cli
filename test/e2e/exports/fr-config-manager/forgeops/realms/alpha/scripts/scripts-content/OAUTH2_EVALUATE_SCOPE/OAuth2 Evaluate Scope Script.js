/*
 * Copyright 2021 ForgeRock AS. All Rights Reserved
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

/*
 * This script lets you populate the scopes with profile attribute values when the tokeninfo endpoint is called.
 * For example, if one of the scopes is mail, AM sets mail to the resource owner's email address in the token information returned.
 *
 * Defined variables:
 * accessToken - AccessToken (1).
 *               The access token to be updated.
 *               Mutable object, all changes to the access token will be reflected.
 * identity - AMIdentity (2).
 *            The client's identity if present or the resource owner's identity. Can be null.
 * scriptName - String (primitive).
 *              Always present, the display name of the script.
 * logger - Always present, the "OAuth2Provider" debug logger instance:
 *          https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 *          Corresponding log files will be prefixed with: scripts.OAUTH2_ACCESS_TOKEN_MODIFICATION.
 * httpClient - HTTP Client (3).
 *              Always present, the HTTP Client instance:
 *              https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-http-client.html#scripting-api-global-http-client.
 *
 * Return - a Map<String, Object> of the access token's information (4).
 *
 * Class reference:
 * (1) AccessToken - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/oauth2/core/AccessToken.html.
 * (2) AMIdentity - https://backstage.forgerock.com/docs/am/7/apidocs/com/sun/identity/idm/AMIdentity.html.
 * (3) Client - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/http/Client.html.
 * (4) Map - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/HashMap.html.
 */

/**
 * Default evaluate scope script to use as a template for new scripts.
 */

(function () {
    var map = new java.util.HashMap();
    if (identity !== null) {
        var scopes = accessToken.getScope().toArray();
        scopes.forEach(function (scope) {
            var attributes = identity.getAttribute(scope).toArray();
            map.put(scope, attributes.join(","));
        });
    } else {
        logger.error('identity is null');
    }
    return map;
}());
