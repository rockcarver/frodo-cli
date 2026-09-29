/**
 * ============================================================
 *  PINGONE RECOGNIZE BIOMETRIC UNENROLLMENT
 *  PingOne AIC — Custom Node (Node Designer)
 * ============================================================
 *
 *  Import via:  Journeys → Node Designer → Import  (or REST API)
 *
 *  NODE PROPERTIES (configured in Node Designer):
 *    • tenantEnvironment — SANDBOX | US | EUROPE | LATAM
 *    • tenantName        — P1 Recognize tenant/customer name
 *    • apiKey            — P1 Recognize API key (supports ESV dot notation e.g. esv.p1recognize.apikey)
 *
 *  NODE OUTCOMES:
 *    • success      — user biometric enrollment successfully deleted
 *    • notEnrolled  — user has no biometric enrollment on record
 *    • error        — API call failed or unexpected HTTP response
 *
 *  SHARED-STATE INPUTS (prior node, e.g. Platform Username):
 *    • username
 *
 * Author(s):
 *    Mike Simon (@mjspi)
 * ============================================================
 */

//// CONSTANTS
var ENV_CONFIGS = {
  "SANDBOX": {
    AUTH_URL: "https://authentication-service-sandbox.eks.core-production.keyless.technology",
    OPS_URL:  "https://operations-service-sandbox.eks.core-production.keyless.technology"
  },
  "US": {
    AUTH_URL: "https://authentication-service.eks.core-production.saas-us-east.keyless.technology",
    OPS_URL:  "https://api.eks.core-production.saas-us-east.keyless.technology"
  },
  "EUROPE": {
    AUTH_URL: "https://authentication-service.eks.core-production.keyless.technology",
    OPS_URL:  "https://api.keyless.io"
  },
  "LATAM": {
    AUTH_URL: "https://authentication-service.eks.core-production.latam.keyless.technology",
    OPS_URL:  "https://api.eks.core-production.latam.keyless.technology"
  }
};

//// PARAMETERS
var envKey    = String(properties.tenantEnvironment || "US");
var envConfig = ENV_CONFIGS[envKey] || ENV_CONFIGS["US"];

var P1R_API_KEY  = String(properties.apiKey     || "");
var P1R_CUSTOMER = String(properties.tenantName || "");

var P1R_USER_CHECK_URL = envConfig.AUTH_URL + "/v1/users/" + P1R_CUSTOMER + "/";
var P1R_DELETE_URL     = envConfig.OPS_URL  + "/v2/users/";

//// OUTCOMES
var NODE_OUTCOME = { SUCCESS: "success", NOT_ENROLLED: "notEnrolled", ERROR: "error" };

//// UTILITIES
// ─────────────────────────────────────────────────────────────
//  maskUser — partial-mask a username for log output (PII hygiene)
// ─────────────────────────────────────────────────────────────
function maskUser(u) {
  var s = String(u || "");
  return s.length > 3 ? s.substring(0, 3) + "***" : "***";
}

//// MAIN
(function () {

  var username = nodeState.get("username");
  if (!username) {
    logger.error("[P1RecognizeUnenroll] 'username' not found in nodeState — ensure a Platform Username node precedes this node.");
    action.goTo(NODE_OUTCOME.ERROR);
    return;
  }

  // ── Step 1: Check enrollment status and retrieve keylessId ──
  try {
    var checkUrl      = P1R_USER_CHECK_URL + encodeURIComponent(username);
    var checkResponse = httpClient.send(checkUrl, {
      method  : "GET",
      headers : { "Kl-Api-Key": P1R_API_KEY }
    }).get();

    if (checkResponse.status !== 200) {
      logger.error("[P1RecognizeUnenroll] enrollment check HTTP " + checkResponse.status + " user=" + maskUser(username));
      action.goTo(NODE_OUTCOME.ERROR);
      return;
    }

    var body = JSON.parse(checkResponse.text());

    if (body.isEnrolled !== true) {
      logger.warn("[P1RecognizeUnenroll] user not enrolled user=" + maskUser(username));
      action.goTo(NODE_OUTCOME.NOT_ENROLLED);
      return;
    }

    var keylessId = String(body.keylessId || "");
    if (!keylessId) {
      logger.error("[P1RecognizeUnenroll] enrolled but keylessId missing user=" + maskUser(username));
      action.goTo(NODE_OUTCOME.ERROR);
      return;
    }

  } catch (e) {
    logger.error("[P1RecognizeUnenroll] enrollment check exception: " + e);
    action.goTo(NODE_OUTCOME.ERROR);
    return;
  }

  // ── Step 2: Delete enrollment by keylessId ──────────────────
  try {
    var deleteUrl      = P1R_DELETE_URL + encodeURIComponent(keylessId);
    var deleteResponse = httpClient.send(deleteUrl, {
      method  : "DELETE",
      headers : { "X-Api-Key": P1R_API_KEY }
    }).get();

    if (deleteResponse.status === 200) {
      logger.info("[P1RecognizeUnenroll] success user=" + maskUser(username));
      action.goTo(NODE_OUTCOME.SUCCESS);
      return;
    }

    logger.error("[P1RecognizeUnenroll] delete HTTP " + deleteResponse.status + " user=" + maskUser(username));
    action.goTo(NODE_OUTCOME.ERROR);

  } catch (e) {
    logger.error("[P1RecognizeUnenroll] delete exception: " + e);
    action.goTo(NODE_OUTCOME.ERROR);
  }

}());
