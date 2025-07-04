/*
 * Copyright 2021 ForgeRock AS. All Rights Reserved
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

/*
 * This script validates the requested scopes against the allowed scopes.
 * If no scopes are requested, default scopes are assumed.
 * The script has four top level functions that could be executed during the different OAuth2 flows:
 *      - validateAuthorizationScope
 *      - validateAccessTokenScope
 *      - validateRefreshTokenScope
 *      - validateBackChannelAuthorizationScope
 *
 * Defined variables:
 * requestedScopes - Set<String> (1).
 *          The set of requested scopes.
 * defaultScopes - Set<String> (1).
 *                 The set of default scopes.
 * allowedScopes - Set<String> (1).
 *                 The set of allowed scopes.
 * scriptName - String (primitive).
 *              Always present, the display name of the script.
 * logger - Always present, the debug logger instance:
 *          https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 *          Corresponding log files will be prefixed with: scripts.OAUTH2_VALIDATE_SCOPE
 * httpClient - HTTP Client (2).
 *              Always present, the HTTP Client instance:
 *              https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-http-client.html#scripting-api-global-http-client.
 *
 * Throws InvalidScopeException:
 *      - if there are no scopes requested and default scopes are empty
 *      - if a requested scope is not allowed
 *
 * Return - a Set<String> of validated scopes (1).
 *
 * Class reference:
 * (1) Set - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/HashSet.html.
 * (2) Client - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/http/Client.html.
 */

/**
 * Default validate scope script.
 */
function validateScopes () {
    var frJava = JavaImporter(
        org.forgerock.oauth2.core.exceptions.InvalidScopeException
    );

    var scopes;
    if (requestedScopes == null || requestedScopes.isEmpty()) {
        scopes = defaultScopes;
    } else {
        scopes = new java.util.HashSet(allowedScopes);
        scopes.retainAll(requestedScopes);
        if (requestedScopes.size() > scopes.size()) {
            var invalidScopes = new java.util.HashSet(requestedScopes);
            invalidScopes.removeAll(allowedScopes);
            throw new frJava.InvalidScopeException('Unknown/invalid scope(s)');
        }
    }

    if (scopes == null || scopes.isEmpty()) {
        throw new frJava.InvalidScopeException('No scope requested and no default scope configured');
    }
    return scopes;
}

function validateAuthorizationScope () {
    return validateScopes();
}

function validateAccessTokenScope () {
    return validateScopes();
}

function validateRefreshTokenScope () {
    return validateScopes();
}

function validateBackChannelAuthorizationScope () {
    return validateScopes();
}
