/*
 * Copyright 2023-2025 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * The script has these top level functions that could be executed during a SAML2 flow.
 *      - preSingleSignOnRequest
 *      - preSingleSignOnProcess
 *      - postSingleSignOnSuccess
 *      - postSingleSignOnFailure
 *      - postNewNameIDSuccess
 *      - postTerminateNameIDSuccess
 *      - preSingleLogoutProcess
 *      - postSingleLogoutSuccess
 *
 * Please see the JavaDoc for the interface for more information about these methods.
 * https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/org/forgerock/openam/saml2/plugins/SPAdapter.html
 * Note that the initialize method is not supported in the scripts.
 *
 * Defined variables. Check the documentation on the respective functions for the variables available to it.
 *
 * hostedEntityId - String
 *     Entity ID for the hosted SP
 * realm - String
 *     Realm of the hosted SP
 * idpEntityId - String
 *     The entity ID for the Identity Provider for which the sign-on request will be sent.
 * request - HttpServletRequest (1)
 *     Servlet request object
 * response - HttpServletResponse (2)
 *     Servlet response object
 * authnRequest - AuthnRequest (3)
 *     The authentication request sent that is sent from the Service Provider.
 * session - SSOToken (4)
 *     The single sign-on session. The reference type of this is Object and would need to be casted to SSOToken.
 * res - Response (5)
 *     The SSO Response received from the Identity Provider.
 * profile - String
 *     The protocol profile that is used, this will be one of the following values from SAML2Constants (6):
 *          - SAML2Constants.HTTP_POST
 *          - SAML2Constants.HTTP_ARTIFACT
 *          - SAML2Constants.PAOS
 * out - PrintWriter (7)
 *     The PrintWriter that can be used to write to.
 * isFederation - boolean
 *     Set to true if using federation, otherwise false.
 * failureCode - int
 *     An integer holding the failure code when an error has occurred. For potential values see SPAdapter.
 * userId - String
 *     The unique universal ID of the user with whom the new name identifier request was performed.
 * idRequest - ManageNameIDRequest (8)
 *     The new name identifier request, this will be null if the request object is not available
 * idResponse - ManageNameIDResponse (9)
 *     The new name identifier response, this will be null if the response object is not available
 * binding - String
 *     The binding used for the new name identifier request. This will be one of the following values:
 *          - SAML2Constants.SOAP
 *          - SAML2Constants.HTTP_REDIRECT
 * logoutRequest - LogoutRequest (10)
 *     The single logout request.
 * logoutResponse - LogoutResponse (11)
 *     The single logout response.
 * spAdapterScriptHelper - SpAdapterScriptHelper (12)
 *     An instance of SpAdapterScriptHelper containing helper methods. See Javadoc for more details.
 * logger - Logger instance
 *     https://backstage.forgerock.com/docs/am/7/scripting-guide/scripting-api-global-logger.html#scripting-api-global-logger.
 *     Corresponding log files will be prefixed with: scripts.<script name>
 *
 * Throws SAML2Exception (13):
 *     for any exceptions occurring in the adapter. The federation process will continue
 *
 * Class reference:
 * (1) HttpServletRequest - https://tomcat.apache.org/tomcat-10.1-doc/servletapi/jakarta/servlet/http//HttpServletRequest.html.
 * (2) HttpServletResponse - https://tomcat.apache.org/tomcat-10.1-doc/servletapi/jakarta/servlet/http//HttpServletResponse.html.
 * (3) AuthnRequest - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/protocol/AuthnRequest.html.
 * (4) SSOToken - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/iplanet/sso/SSOToken.html.
 * (5) Response - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/protocol/Response.html
 * (6) SAML2Constants - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/common/SAML2Constants.html
 * (7) PrintWriter - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/io/PrintWriter.html
 * (8) ManageNameIDRequest - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/protocol/ManageNameIDRequest.html
 * (9) ManageNameIDResponse - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/protocol/ManageNameIDResponse.html
 * (10) LogoutRequest - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/protocol/LogoutRequest.html
 * (11) LogoutResponse - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/protocol/LogoutResponse.html
 * (12) SpAdapterScriptHelper - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/plugins/scripted/SpAdapterScriptHelper.html.
 * (13) SAML2Exception - https://backstage.forgerock.com/docs/am/7.3/_attachments/apidocs/com/sun/identity/saml2/common/SAML2Exception.html.
 */

/*
 * Template/default script for SAML2 SP Adapter scripted plugin.
 */

/*
 * Available variables for preSingleSignOnRequest:
 *     hostedEntityId
 *     idpEntityId
 *     realm
 *     request
 *     response
 *     authnRequest
 *     spAdapterScriptHelper
 *     logger
 */
function preSingleSignOnRequest() {
}

/*
 * Available variables for preSingleSignOnProcess:
 *     hostedEntityId
 *     realm
 *     request
 *     response
 *     authnRequest
 *     res
 *     profile
 *     spAdapterScriptHelper
 *     logger
 */
function preSingleSignOnProcess() {
}

/*
 * Available variables for postSingleSignOnSuccess:
 *     hostedEntityId
 *     realm
 *     request
 *     response
 *     out
 *     session
 *     authnRequest
 *     res
 *     profile
 *     isFederation
 *     spAdapterScriptHelper
 *     logger
 *
 * Return - true if response is being redirected, false if not. Default to false.
 */
function postSingleSignOnSuccess() {
    return false;
}

/*
 * Available variables for postSingleSignOnFailure:
 *     hostedEntityId
 *     realm
 *     request
 *     response
 *     authnRequest
 *     res
 *     profile
 *     failureCode
 *     spAdapterScriptHelper
 *     logger
 *
 * Return - true if response is being redirected, false if not. Default to false.
 */
function postSingleSignOnFailure() {
    return false;
}

/*
 * Available variables for postNewNameIDSuccess:
 *     hostedEntityId
 *     realm
 *     request
 *     response
 *     userId
 *     idRequest
 *     idResponse
 *     binding
 *     spAdapterScriptHelper
 *     logger
 */
function postNewNameIDSuccess() {
}

/*
 * Available variables for postTerminateNameIDSuccess:
 *     hostedEntityId
 *     realm
 *     request
 *     response
 *     userId
 *     idRequest
 *     idResponse
 *     binding
 *     spAdapterScriptHelper
 *     logger
 */
function postTerminateNameIDSuccess() {
}

/*
 * Available variables for preSingleLogoutProcess:
 *     hostedEntityId
 *     realm
 *     request
 *     response
 *     userId
 *     logoutRequest
 *     logoutResponse
 *     binding
 *     spAdapterScriptHelper
 *     logger
 */
function preSingleLogoutProcess() {
}

/*
 * Available variables for postSingleLogoutSuccess:
 *     hostedEntityId
 *     realm
 *     request
 *     response
 *     userId
 *     logoutRequest
 *     logoutResponse
 *     binding
 *     spAdapterScriptHelper
 *     logger
 */
function postSingleLogoutSuccess() {
}
