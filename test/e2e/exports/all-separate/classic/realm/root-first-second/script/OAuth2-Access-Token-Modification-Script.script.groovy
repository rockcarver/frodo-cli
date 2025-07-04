/*
 * Copyright 2019-2020 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

import org.forgerock.http.protocol.Request
import org.forgerock.http.protocol.Response

import com.iplanet.sso.SSOException

import groovy.json.JsonSlurper

/**
 * Defined variables:
 * accessToken - The access token to be updated. Mutable object, all changes to the access token will be reflected.
 * httpClient - always present, the HTTP client that can be used to make external HTTP requests
 * identity - always present, the identity of the resource owner
 * logger - always present, corresponding log files will be prefixed with: scripts.OAUTH2_ACCESS_TOKEN_MODIFICATION.
 * scopes - always present, the requested scopes
 * session - present if the request contains the session cookie, the user's session object
 * scriptName - always present, the display name of the script
 * requestProperties - always present, contains a map of request properties:
 *                     requestUri - the request URI
 *                     realm - the realm that the request relates to
 *                     requestParams - a map of the request params and/or posted data. Each value is a list of one or
 *                     more properties. Please note that these should be handled in accordance with OWASP best
 *                     practices.
 * clientProperties - present if the client specified in the request was identified, contains a map of client
 *                    properties:
 *                    clientId - the client's Uri for the request locale
 *                    allowedGrantTypes - list of the allowed grant types (org.forgerock.oauth2.core.GrantType)
 *                                        for the client
 *                    allowedResponseTypes - list of the allowed response types for the client
 *                    allowedScopes - list of the allowed scopes for the client
 *                    customProperties - A map of the custom properties of the client.
 *                                       Lists or maps will be included as sub-maps, e.g:
 *                                       testMap[Key1]=Value1 will be returned as testmap -> Key1 -> Value1
 *
 * No return value - changes shall be made to the accessToken parameter directly.
 *
 * The changes made to OAuth2 access tokens will directly impact the size of the CTS tokens, and similarly the size of
 * the JWTs if client based OAuth2 tokens are utilised.
 * When adding/updating fields make sure that the token size remains within client/user-agent limits.
 */

/*
//Field to always include in token
accessToken.setField("hello", "world")

//Obtain additional values by performing a REST call to an external service
try {
    Response response = httpClient.send(new Request()
            .setUri("https://third.party.app/hello.jsp")
            .setMethod("POST")
            .modifyHeaders({ headers -> headers.put("Content-Type", "application/json;charset=UTF-8") })
//          .setEntity('foo=bar&hello=world'))
            .setEntity([foo: 'bar']))
            .getOrThrow()
    if (response.status.successful) {
        def result = new JsonSlurper().parseText(response.entity.string)
        accessToken.setFields(result.get("updatedFields"))
    } else {
        logger.error("Unable to obtain access token modifications: {}, {}", response.status, response.entity.toString())
    }
} catch (InterruptedException ex) {
    logger.error("The request processing was interrupted", ex)
    Thread.currentThread().interrupt()
    //The access token request will fail with HTTP 500 error in this case.
    throw new RuntimeException("Unable to obtain response from ")
}

//Add new fields containing identity attribute values
def attributes = identity.getAttributes(["mail", "telephoneNumber"].toSet())
accessToken.setField("mail", attributes["mail"])
accessToken.setField("phone", attributes["telephoneNumber"])

//Add new fields containing session property values
if (session != null) { // session is not available for resource owner password credentials grant
    try {
        accessToken.setField("ipAddress", session.getProperty("Host"))
    } catch (SSOException ex) {
        logger.error("Unable to retrieve session property value", ex)
    }
}

// Remove a native field from the token entry, that was set by AM. For complete list of remove* methods see the JavaDoc
// for org.forgerock.oauth2.core.AccessToken class.
accessToken.removeTokenName()
*/
