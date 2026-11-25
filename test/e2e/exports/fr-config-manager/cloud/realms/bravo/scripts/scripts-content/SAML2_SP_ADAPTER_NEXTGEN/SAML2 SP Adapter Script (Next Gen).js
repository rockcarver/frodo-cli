/*
 * Copyright 2026 Ping Identity Corporation. All Rights Reserved
 *
 * This code is to be used exclusively in connection with Ping Identity
 * Corporation software or services. Ping Identity Corporation only offers
 * such software or services to legal entities who have entered into a
 * binding license agreement with Ping Identity Corporation.
 */

/*
 * This script allows customization of SAML2 Service Provider (SP) adapter behavior at various points
 * in the SAML2 authentication flow.
 *
 * Next-gen bindings available in this script (depending on the method being invoked):
 *
 * idpEntityId - String
 *      The entity ID of the Identity Provider.
 * profile - String
 *      The SAML2 profile being used (e.g., "urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser").
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 * isFederation - Boolean
 *      True if this is a federation scenario, false otherwise.
 * userId - String
 *      The universal ID of the user.
 * failureCode - Integer
 *      The failure code indicating the type of SSO failure (see SPAdapter constants).
 * ssoResponse - Map
 *      The SAML2 Response object from the IDP as a JSON map.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * authnRequest - Map
 *      The SAML2 AuthnRequest object as a JSON map.
 * authnRequestHelper - AuthnRequestHelper
 *      Helper object for retrieving and updating properties of the AuthnRequest.
 * session - ScriptedSession
 *      The user's session object (when available).
 * realm - String
 *      The realm of the hosted SP.
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * binding - String
 *      The SAML2 binding being used (e.g., "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST").
 */

/**
 * Invoked before AM sends the Single-Sign-On request to IDP.
 *
 * Available bindings:
 * idpEntityId - String
 *      The entity ID of the Identity Provider.
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * authnRequest - Map
 *      The SAML2 AuthnRequest object as a JSON map.
 * authnRequestHelper - AuthnRequestHelper
 *      Helper object for retrieving and updating properties of the AuthnRequest.
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 *
 * Throw an exception to fail the process.
 */
function preSingleSignOnRequest() {
}

/**
 * Invoked when AM receives the Single-Sign-On response from the IDP,
 * before any processing starts on the SP side.
 *
 * Available bindings:
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * authnRequest - Map
 *      The SAML2 AuthnRequest object as a JSON map.
 * authnRequestHelper - AuthnRequestHelper
 *      Helper object for retrieving and updating properties of the AuthnRequest.
 * ssoResponse - Map
 *      The SAML2 Response object from the IDP as a JSON map.
 * profile - String
 *      The SAML2 profile being used (e.g., "urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser").
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 *
 * Throw an exception to fail the process.
 */
function preSingleSignOnProcess() {
}

/**
 * Invoked after Single-Sign-On processing succeeds.
 *
 * Available bindings:
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * session - ScriptedSession
 *      The user's session object.
 * authnRequest - Map
 *      The SAML2 AuthnRequest object as a JSON map.
 * authnRequestHelper - AuthnRequestHelper
 *      Helper object for retrieving and updating properties of the AuthnRequest.
 * ssoResponse - Map
 *      The SAML2 Response object from the IDP as a JSON map.
 * profile - String
 *      The SAML2 profile being used (e.g., "urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser").
 * isFederation - Boolean
 *      True if this is a federation scenario, false otherwise.
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 *
 * Return true if browser redirection occurred after processing, false otherwise.
 * Throw an exception to fail the process.
 */
function postSingleSignOnSuccess() {
    return false;
}

/**
 * Invoked after Single-Sign-On processing fails.
 *
 * Available bindings:
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * authnRequest - Map
 *      The SAML2 AuthnRequest object as a JSON map.
 * authnRequestHelper - AuthnRequestHelper
 *      Helper object for retrieving and updating properties of the AuthnRequest.
 * ssoResponse - Map
 *      The SAML2 Response object from the IDP as a JSON map.
 * profile - String
 *      The SAML2 profile being used (e.g., "urn:oasis:names:tc:SAML:2.0:profiles:SSO:browser").
 * failureCode - Integer
 *      The failure code indicating the type of SSO failure (see SPAdapter constants).
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 *
 * Return true if browser redirection occurred, false otherwise.
 */
function postSingleSignOnFailure() {
    return false;
}

/**
 * Invoked after new Name Identifier processing succeeds.
 *
 * Available bindings:
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * userId - String
 *      The universal ID of the user.
 * binding - String
 *      The SAML2 binding being used (e.g., "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST").
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 */
function postNewNameIDSuccess() {
}

/**
 * Invoked after Terminate Name Identifier processing succeeds.
 *
 * Available bindings:
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * userId - String
 *      The universal ID of the user.
 * binding - String
 *      The SAML2 binding being used (e.g., "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST").
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 */
function postTerminateNameIDSuccess() {
}

/**
 * Invoked before single logout process starts on SP side.
 * This is called before the user session is invalidated on the service provider side.
 *
 * Available bindings:
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * userId - String
 *      The universal ID of the user.
 * binding - String
 *      The SAML2 binding being used (e.g., "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST").
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 *
 * Throw an exception to fail the process.
 */
function preSingleLogoutProcess() {
}

/**
 * Invoked after single logout process succeeds, i.e., user session has been invalidated.
 *
 * Available bindings:
 * hostedEntityId - String
 *      The entity ID of the hosted SP.
 * realm - String
 *      The realm of the hosted SP.
 * request - Map
 *      The HttpServletRequest object as a JSON map.
 * response - Map
 *      The HttpServletResponse object as a JSON map.
 * userId - String
 *      The universal ID of the user.
 * binding - String
 *      The SAML2 binding being used (e.g., "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST").
 * spAdapterScriptHelper - SpAdapterScriptHelper
 *      Helper object providing utility methods for SP adapter operations.
 * requestHelper - HttpServletRequestHelper
 *      Helper object for accessing and manipulating HttpServletRequest properties (attributes, headers, parameters).
 * responseHelper - HttpServletResponseHelper
 *      Helper object for accessing and manipulating HttpServletResponse properties (headers, redirects).
 */
function postSingleLogoutSuccess() {
}
