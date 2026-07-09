/*
 * Copyright 2021 ForgeRock AS. All Rights Reserved
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

/*
 * This script lets you return additional data when authorize request is called.
 *
 * Defined variables:
 *
 * session - SSOToken (1)
 *           Present if the request contains the session cookie, the user's session object.
 *
 * httpClient - HTTP Client (2).
 *              Always present, the HTTP client that can be used to make external HTTP requests
 *
 * logger - Debug (3)
 *          Always present, the "ScriptedAuthorizeEndpointDataProvider" debug logger instance:
 *          https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 *          Corresponding log files will be prefixed with: scripts.OAUTH2_AUTHORIZE_ENDPOINT_DATA_PROVIDER.
 *
 * scriptName - String (primitive).
 *              Always present, the display name of the script
 *
 * Return - a Map<String, String> of additional data (4).
 *
 * Class reference:
 * (1) SSOToken - https://backstage.forgerock.com/docs/am/7/apidocs/com/iplanet/sso/SSOToken.html.
 * (2) Client - https://backstage.forgerock.com/docs/am/7/apidocs/org/forgerock/http/Client.html.
 * (3) Debug - https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 * (4) Map - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/util/HashMap.html.
 */

/**
 * Default authorize endpoint data provider script to use as a template for new scripts.
 */

/* EXAMPLE
var map = new java.util.HashMap();

function addAdditionalData() {

    //If constant data needs to be returned
    map.put("hello", "world");

    //If some data needs to be returned from third party service
    addAdditionalDataFromExternalService();

    //If there is a need to return some user session data
    addAdditionalDataFromSessionProperties()

    return map;
};

function addAdditionalDataFromExternalService() {
  var frJava = JavaImporter(
        org.forgerock.oauth2.core.exceptions.ServerException
    );
  try {
        //Obtain additional data by performing a REST call to an external service
        var request = new org.forgerock.http.protocol.Request();
        request.setUri("https://third.party.app/hello.jsp");
        request.setMethod("POST");
        //request.setEntity("foo=bar&hello=world");
        request.setEntity(json(object(
                    field("foo", "bar"))));
        var response = httpClient.send(request).getOrThrow();
        logResponse(response);
        var result = JSON.parse(response.getEntity());
        map.put("someKey",result.get("someKey"));
  } catch (err) {
     throw new frJava.ServerException(err);
  }
};

function addAdditionalDataFromSessionProperties() {
  //Add additional data from session property values
   if (session != null) { // session is not available for resource owner password credentials grant
     map.put("ipAddress", session.getProperty("Host"))
   }
};

function logResponse(response) {
    logger.message("User REST Call. Status: " + response.getStatus() + ", Body: " + response.getEntity());
};

addAdditionalData();
*/
