/*
 * Copyright 2021-2022 ForgeRock AS. All Rights Reserved
 *
 * Use of this code requires a commercial software license with ForgeRock AS.
 * or with one of its affiliates. All use shall be exclusively subject
 * to such license between the licensee and ForgeRock AS.
 */

/*
 * The script has these top level functions that could be executed during a SAML2 flow.
 *      - preSingleSignOn
 *      - preAuthentication
 *      - preSendResponse
 *      - preSignResponse
 *      - preSendFailureResponse
 *
 * Please see the javadoc for the interface definition and more information about these methods.
 * https://backstage.forgerock.com/docs/am/7.2/apidocs/com/sun/identity/saml2/plugins/SAML2IdentityProviderAdapter.html
 * Note that the initialize method is not supported in the scripts.
 *
 * Defined variables. Check the documentation on the respective functions for the variables available to it.
 *
 * hostedEntityId - String
 *     Entity ID for the hosted IDP
 * realm - String
 *     Realm of the hosted IDP
 * idpAdapterScriptHelper - IdpAdapterScriptHelper (1)
 *     An instance of IdpAdapterScriptHelper containing helper methods. See Javadoc for more details.
 * request - HttpServletRequest (2)
 *     Servlet request object
 * response - HttpServletResponse (3)
 *     Servlet response object
 * authnRequest - AuthnRequest (4)
 *     The original authentication request sent from SP
 * reqId - String
 *     The id to use for continuation of processing if the adapter redirects
 * res - Response (5)
 *     The SAML Response
 * session - SSOToken (6)
 *     The single sign-on session. The reference type of this is Object and would need to be casted to SSOToken.
 * relayState - String
 *     The relayState that will be used in the redirect
 * faultCode - String
 *     the fault code that will be returned in the SAML response
 * faultDetail - String
 *     the fault detail that will be returned in the SAML response
 * logger - Logger instance
 *     https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 *     Corresponding log files will be prefixed with: scripts.<script name>
 *
 * Throws SAML2Exception (7):
 *     for any exceptions occurring in the adapter. The federation process will continue
 *
 * Class reference:
 * (1) idpAdapterScriptHelper - https://backstage.forgerock.com/docs/am/7.2/apidocs/com/sun/identity/saml2/plugins/scripted/IdpAdapterScriptHelper.html.
 * (2) HttpServletRequest - https://tomcat.apache.org/tomcat-7.0-doc/servletapi/javax/servlet/http/HttpServletRequest.html.
 * (3) HttpServletResponse - https://tomcat.apache.org/tomcat-7.0-doc/servletapi/javax/servlet/http/HttpServletResponse.html.
 * (4) AuthnRequest - https://backstage.forgerock.com/docs/am/7.2/apidocs/com/sun/identity/saml2/protocol/AuthnRequest.html.
 * (5) Response - https://backstage.forgerock.com/docs/am/7.2/apidocs/com/sun/identity/saml2/protocol/Response.html.
 * (6) SSOToken - https://backstage.forgerock.com/docs/am/7.2/apidocs/com/iplanet/sso/SSOToken.html.
 * (7) SAML2Exception - https://backstage.forgerock.com/docs/am/7.2/apidocs/com/sun/identity/saml2/common/SAML2Exception.html.
 */

/*
 * Template/default script for SAML2 IDP Adapter scripted plugin.
 */

/*
 * Available variables for preSingleSignOn:
 *     hostedEntityId
 *     realm
 *     idpAdapterScriptHelper
 *     request
 *     authnRequest
 *     response
 *     reqId
 *     logger
 *
 * Return - true if browser redirection is happening after processing, false otherwise. Default to false.
 */
function preSingleSignOn () {
      logger.error("Chicago: preSingleSignOn");
    return true;
}

/*
 * Available variables for preAuthentication:
 *     hostedEntityId
 *     realm
 *     idpAdapterScriptHelper
 *     request
 *     authnRequest
 *     response
 *     reqId
 *     session
 *     relayState
 *     logger
 *
 * Return - true if browser redirection is happening after processing, false otherwise. Default to false.
 */
function preAuthentication () {
      logger.error("Chicago: preAuthentication");
    return true;
}

/*
 * Available variables for preSendResponse:
 *     hostedEntityId
 *     realm
 *     idpAdapterScriptHelper
 *     request
 *     authnRequest
 *     response
 *     reqId
 *     session
 *     relayState
 *     logger
 *
 * Return - true if browser redirection happened after processing, false otherwise. Default to false.
 */
function preSendResponse () {
      logger.error("Chicago: preSendResponse");
      logger.error("Chicago: authnRequest: "+authnRequest);
      response.sendRedirect("https://idc.scheuber.io/am/XUI/?realm=alpha&authIndexType=service&authIndexValue=Dispatcher&ForceAuth=true&goto="+relayState);
    return true;
}

/*
 * Available variables for preSignResponse:
 *     hostedEntityId
 *     realm
 *     idpAdapterScriptHelper
 *     request
 *     authnRequest
 *     session
 *     relayState
 *     res
 *     logger
 */
function preSignResponse () {
      logger.error("Chicago: preSignResponse");
}

/*
 * Available variables for preSendFailureResponse:
 *     hostedEntityId
 *     realm
 *     idpAdapterScriptHelper
 *     request
 *     response
 *     faultCode
 *     faultDetail
 *     logger
 */
function preSendFailureResponse () {
      logger.error("Chicago: preSendFailureResponse");
}
