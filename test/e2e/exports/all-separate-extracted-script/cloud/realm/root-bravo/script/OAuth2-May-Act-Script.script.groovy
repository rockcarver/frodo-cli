/*
 * Copyright 2020-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/**
 * Defined variables:
 * token - The access token to be updated. Mutable object, all changes to the access token will be reflected.
 * logger - always present, corresponding log files will be prefixed with: scripts.OAUTH2_ACCESS_TOKEN_MODIFICATION.
 * scriptName - always present, the display name of the script
 * session - present if the request contains the session cookie, the user's session object
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
 * identity - always present, the identity of the resource owner
 * scopes - always present, the requested scopes
 */
/*
import org.forgerock.json.JsonValue

token.setMayAct(
    JsonValue.json(JsonValue.object(
        JsonValue.field("client_id", "myClient"), 
        JsonValue.field("sub", "(usr!myActor)"))))
*/
