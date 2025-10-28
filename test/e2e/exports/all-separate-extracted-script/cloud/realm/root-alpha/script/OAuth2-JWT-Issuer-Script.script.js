/*
 * Copyright 2022-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * This script lets you to derive the configuration for a dynamic JWT issuer from the issuer string.
 * A JWT issuer is made up of the following:
 *   - issuer - the identifier of the entity that issues JWTs
 *   - resource owner subject claim - the name of the claim in the JWT that identifies the resource owner
 *   - consented scope claim - the name of the claim in the JWT that represents scope that the resource owner
 *                             has already consented to externally
 *   - authorized subjects - the set of principal identifiers that are authorized to be used as resource owners
 *                           by the issuer
 *   - JWKs - either a set of JWKs or connection details for obtaining that set, that are the public keys that
 *            can verify the signature on the issued JWTs.
 *
 * Defined variables:
 * issuer - String
 *          The issuer from the bearer JWT.
 * realm - String
 *         The path of the realm that is handling the request.
 * scriptName - String.
 *              Always present, the display name of the script.
 * logger - Always present, the script debug logger instance:
 *          https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 *          Corresponding log files will be prefixed with: scripts.OAUTH2_SCRIPTED_JWT_ISSUER.
 * httpClient - HTTP Client (1).
 *              Always present, the HTTP Client instance:
 *              https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-http-client.html#scripting-api-global-http-client.
 * idRepository - Identity Repository (2). Always present.
 * secrets - Secrets accessor (3). Always present.
 *
 * Return - org.forgerock.oauth2.core.TrustedJwtIssuerConfig (4) - the configuration of the trusted JWT issuer.
 *
 * Class reference:
 * (1) Client - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/http/Client.html.
 * (2) ScriptedIdentityRepository - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/openam/scripting/api/identity/ScriptedIdentityRepository.html.
 * (3) ScriptedSecrets - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/openam/scripting/api/secrets/ScriptedSecrets.html.
 * (4) TrustedJwtIssuerConfig - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/oauth2/core/TrustedJwtIssuerConfig.html.
 */

/* EXAMPLE
(function () {
    var frJava = JavaImporter(
        org.forgerock.oauth2.core.TrustedJwtIssuerConfig,
        java.util.Collections
    );

    var iss = idRepository.getIdentity(issuer);
    if (iss == null) {
        logger.message('No issuer found for: '+issuer);
        return null;
    }
    logger.message('Found issuer: '+iss);
    // in this example either a JWK set or a URI to a JWK set are in the postalAddress attribute
    var jwksAttrs = iss.getAttributeValues('postalAddress');
    var jwkSet = jwksAttrs.length === 0 ? null : jwksAttrs[0];
    var config = new frJava.TrustedJwtIssuerConfig(
        issuer,
        'sub',
        'scope',
        // in this example, valid subjects are stored in the mail attribute
        iss.getAttributeValues('mail'),
        jwkSet.startsWith('{') ? jwkSet : null,
        jwkSet.startsWith('http') ? jwkSet : null,
        '5 minutes',
        '1 minute'
    );
    return config;
}());
*/
