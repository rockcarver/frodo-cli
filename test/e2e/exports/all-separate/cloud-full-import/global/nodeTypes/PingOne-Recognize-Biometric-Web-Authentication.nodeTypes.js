/**
 * ============================================================
 *  PINGONE RECOGNIZE BIOMETRIC AUTHENTICATION
 *  PingOne AIC — Custom Node (Node Designer)
 * ============================================================
 *
 *  Import via:  Journeys → Node Designer → Import  (or REST API)
 *
 *  NODE PROPERTIES (configured in Node Designer):
 *    • tenantEnvironment        — SANDBOX | US | EUROPE | LATAM
 *    • tenantName               — P1 Recognize tenant/customer name
 *    • apiKey                   — P1 Recognize API key (supports ESV dot notation e.g. esv.p1recognize.apikey)
 *    • publicKeyId              — Image encryption key ID
 *    • publicKey                — Image encryption public key
 *    • webSdkVersion            — Web SDK version to load (e.g. 2.3.0)
 *    • sdkTheme                 — light | dark  (default: light)
 *    • sdkLanguage              — Language override code (e.g. en, fr, de);
 *                                 auto-detected from locale param / Accept-Language if blank
 *    • enableCameraInstructions — Show camera instruction steps before capture (Boolean)
 *    • finishedSubmitDelay      — ms to wait after success before form submit (default: 3000)
 *    • errorSubmitDelay         — ms to wait after error before form submit (default: 3000)
 *    • hidePoweredBy            — Remove 'Powered by Keyless' branding (Boolean)
 *    • sdkThemeOptions          — JSON object for SDK colour overrides
 *    • sdkLocalization          — JSON array of localization packs
 *
 *  NODE OUTCOMES:
 *    • success      — biometric verified; transaction JWT validated
 *    • error        — authentication or JWT verification failed
 *    • retry        — user cancelled / camera error / connection error
 *    • lockout      — lockout policy triggered
 *    • notEnrolled  — user has no biometric enrollment on record
 *
 *  SHARED-STATE INPUTS (prior node, e.g. Platform Username):
 *    • username
 *
 *  SHARED-STATE OUTPUTS (written on success):
 *    • p1RTransactionJwt  — signed JWT from P1 Recognize
 *    • p1RAuthStatus      — "verified" | "unverified"
 *
 *  Required CSP additions (vary by tenantEnvironment):
 *    script-src   https://d3hz8ozgrmhn4r.cloudfront.net
 *    connect-src  <AUTH_URL for selected environment>
 *
 * Author(s):
 *    Mike Simon (@mjspi)
 * ============================================================
 */

//// CONSTANTS
var SDK_CDN_BASE = "https://d3hz8ozgrmhn4r.cloudfront.net/sdk-web-components";

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

// Read properties first so derived URLs can reference them
var P1R_API_KEY    = String(properties.apiKey       || "");
var P1R_KEY_ID     = String(properties.publicKeyId  || "");
var P1R_PUBLIC_KEY = String(properties.publicKey    || "");
var P1R_CUSTOMER   = String(properties.tenantName   || "");

// Derive service URLs from environment config
var P1R_WS_URL           = envConfig.AUTH_URL.replace("https://", "wss://");
var P1R_ENROLL_CHECK_URL = envConfig.AUTH_URL + "/v1/users/" + P1R_CUSTOMER + "/";
var P1R_VERIFY_URL       = envConfig.OPS_URL  + "/v2/verify-jwt";

var SDK_HIDE_POWERED_BY  = (properties.hidePoweredBy === true);
var SDK_THEME            = String(properties.sdkTheme || "light").trim().toLowerCase();
// Detect language: locale query param → Accept-Language header → sdkLanguage property
var SDK_LANGUAGE = (function () {
  // Helper: extract base language code from a BCP-47 tag (e.g. "en-US" → "en")
  function baseLang(tag) {
    return String(tag).trim().split(/[-_]/)[0].toLowerCase();
  }
  // 1. sdkLanguage property — explicit override takes highest priority
  var configured = String(properties.sdkLanguage || "").trim();
  if (configured) { return configured; }
  // 2. locale query parameter — matches AIC hosted page behaviour
  try {
    var localeParam = requestParameters.get("locale");
    if (localeParam && localeParam.get(0)) {
      var lang = baseLang(localeParam.get(0));
      if (lang) { return lang; }
    }
  } catch (e) { /* binding unavailable */ }
  // 3. Accept-Language request header
  // Format: "en-US,en;q=0.9,fr;q=0.8" — take the first tag before any comma or semicolon
  try {
    var acceptLang = requestHeaders.get("Accept-Language");
    if (acceptLang && acceptLang.get(0)) {
      var primary = String(acceptLang.get(0)).split(",")[0].split(";")[0].trim();
      var lang = baseLang(primary);
      if (lang) { return lang; }
    }
  } catch (e) { /* binding unavailable */ }
  // 4. Default to English
  return "en";
})();
var SDK_CAMERA_INSTRUCTIONS  = (properties.enableCameraInstructions === true);
var SDK_THEME_OPTIONS        = String(properties.sdkThemeOptions || "").trim();
var SDK_LOCALIZATION         = String(properties.sdkLocalization || "").trim();

// Optional: data string P1Recognize signs alongside the auth transaction.
// Required for the transactionJWT to be returned in the finished event.
// Defaults to the username if not set.
var P1R_TRANSACTION_DATA = (nodeState.get("transactionData") || "");

// ── Keyless SDK ───────────────────────────────────────────────
var SDK_VERSION  = String(properties.webSdkVersion || "2.3.0");
var SDK_BASE_URL = SDK_CDN_BASE + "/" + SDK_VERSION;
var SDK_MAIN_URL = SDK_BASE_URL + "/index.js";

// ── Options ───────────────────────────────────────────────────
var VERIFY_JWT_ENABLED       = (envKey !== "SANDBOX"); // Auto-disabled in Sandbox
var FINISHED_SUBMIT_DELAY_MS = (properties.finishedSubmitDelay != null ? Number(properties.finishedSubmitDelay) : 3000);
var ERROR_SUBMIT_DELAY_MS    = (properties.errorSubmitDelay    != null ? Number(properties.errorSubmitDelay)    : 3000);

// ── Callback identifiers (must match order of nameCallback registration below)
var CB_JWT_ID    = "p1RTransactionJwt";
var CB_STATUS_ID = "p1RStatus";

//// OUTCOMES
var NODE_OUTCOME = { SUCCESS: "success", ERROR: "error", RETRY: "retry", LOCKOUT: "lockout", NOT_ENROLLED: "notEnrolled" };
var LOCKOUT_CODES = ["USER_LOCKED", "LOCKOUT_EXCEEDED", "MAX_ATTEMPTS_REACHED"];
var RETRY_CODES   = ["CAMERA_PERMISSION_DENIED", "CAMERA_NOT_FOUND", "WEBSOCKET_CLOSED", "CONNECTION_ERROR"];

// ─────────────────────────────────────────────────────────────
//  buildClientScript  — generates the browser-side JS injected
//  via ScriptTextOutputCallback on the first pass.
// ─────────────────────────────────────────────────────────────
function buildClientScript(username) {

  // Escape a value for safe embedding in a single-quoted JS string.
  // Handles backslashes, single quotes, and newlines (common in PEM keys).
  function esc(v) {
    return String(v)
      .replace(/\\/g,  "\\\\")
      .replace(/'/g,   "\\'")
      .replace(/\r/g,  "\\r")
      .replace(/\n/g, "\\n")
      // Use split/join for line-terminator chars — regex literals containing
      // \u2028/\u2029 become raw LineTerminators after JSON decode, causing
      // Rhino parse errors. split().join() avoids regex literal parsing entirely.
      .split("\u0000").join("\\0")
      .split("\u2028").join("\\u2028")
      .split("\u2029").join("\\u2029");
  }

  // Build structured transaction data object for auditing and traceability.
  // Embeds the AIC journey transaction ID alongside any clientData from state.
  var _h  = (typeof requestHeaders !== 'undefined') ? requestHeaders : null;
  var _id = (_h && _h.get('x-forgerock-transactionid')) ? _h.get('x-forgerock-transactionid').get(0) : "no-tx-id";
  var _txObj = { "x-forgerock-transactionid": _id };
  if (P1R_TRANSACTION_DATA) { _txObj["clientData"] = P1R_TRANSACTION_DATA; }
  var txData = JSON.stringify(_txObj);

  return [
    "(function () {",
    "  'use strict';",
    "  function init() {",
    "    if (document.getElementById('kl-auth-overlay')) { return; }",

    // Minimal style block — just the spinner keyframes
    "    var klTheme = document.createElement('style');",
    "    klTheme.setAttribute('data-kl-auth', '');",
    "    klTheme.textContent = '@keyframes klSpin{to{transform:rotate(360deg)}}';",
    "    document.head.appendChild(klTheme);",

    // Inline wrapper — inserted into the callback container so the
    // Page Node's logo/title (rendered above the form) remain visible.
    "    var overlay = document.createElement('div');",
    "    overlay.id = 'kl-auth-overlay';",
    "    overlay.style.cssText = 'display:flex;justify-content:center;';",

    // Card
    "    var card = document.createElement('div');",
    "    card.style.cssText = 'max-width:440px;width:100%;box-sizing:border-box;" +
      "display:flex;flex-direction:column;align-items:center;gap:20px';",

    // Status banner
    "    var banner = document.createElement('div');",
    "    banner.style.cssText = 'display:none;font-size:13px;padding:10px 14px;" +
      "border-radius:8px;width:100%;text-align:center;box-sizing:border-box';",

    // Loading spinner
    "    var spinnerWrap = document.createElement('div');",
    "    spinnerWrap.id = 'kl-auth-loading';",
    "    spinnerWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:30px 0';",
    "    spinnerWrap.innerHTML = '<div style=\"width:40px;height:40px;border:4px solid #dde3f0;" +
      "border-top-color:#003CB4;border-radius:50%;animation:klSpin 0.8s linear infinite\"></div>" +
      "<span style=\"color:#888;font-size:13px\">Loading biometric module\u2026</span>';",

    // kl-auth component
    "    var klAuth = document.createElement('kl-auth');",
    "    klAuth.setAttribute('customer',         '" + esc(P1R_CUSTOMER)   + "');",
    "    klAuth.setAttribute('ws-url',           '" + esc(P1R_WS_URL)     + "');",
    "    klAuth.setAttribute('key-id',           '" + esc(P1R_KEY_ID)     + "');",
    "    klAuth.setAttribute('public-key',       '" + esc(P1R_PUBLIC_KEY) + "');",
    "    klAuth.setAttribute('username',         '" + esc(username)           + "');",
    "    klAuth.setAttribute('transaction-data', '" + esc(txData)             + "');",
    "    klAuth.setAttribute('lang',             '" + esc(SDK_LANGUAGE)       + "');",
    "    klAuth.setAttribute('size',             '320');",
    "    klAuth.setAttribute('theme',            '" + esc(SDK_THEME)          + "');",
    "    klAuth.setAttribute('operation-id',     '" + esc(_id)                + "');",
    // "    klAuth.style.cssText = 'display:none;width:360px;border-radius:10px;overflow:hidden;margin:0 auto';",
    "    klAuth.style.cssText = 'display:none;width:360px;max-width:360px;flex-shrink:0;border-radius:10px;overflow:hidden;margin:0 auto';",

    // ── Optional SDK customisations ──────────────────────────
    "    var _themeOpts = '" + esc(SDK_THEME_OPTIONS) + "';",
    "    if (_themeOpts) { try { klAuth.themeOptions = JSON.parse(_themeOpts); } catch (e) {} }",
    "    var _locRaw = '" + esc(SDK_LOCALIZATION) + "';",
    "    if (_locRaw) {",
    "      try {",
    "        var _locEntries = JSON.parse(_locRaw);",
    "        var _locPacks = [];",
    "        for (var _i = 0; _i < _locEntries.length; _i++) {",
    "          var _e = _locEntries[_i];",
    "          _locPacks.push({ data: _e.data, language: _e.language });",
    "        }",
    "        klAuth.localizationPacks = _locPacks;",
    "      } catch (e) {}",
    "    }",
  ].concat(SDK_CAMERA_INSTRUCTIONS ? [
    "    klAuth.setAttribute('enable-camera-instructions', '');",
  ] : []).concat(SDK_HIDE_POWERED_BY ? [
    "    var _pb = document.createElement('span');",
    "    _pb.setAttribute('slot', 'powered-by');",
    "    klAuth.appendChild(_pb);",
  ] : []).concat([

    // Use Another Method button
    "    var altBtn = document.createElement('button');",
    "    altBtn.textContent = 'Use Another Method';",
    "    altBtn.type = 'button';",
    "    altBtn.style.cssText = 'background:none;border:1px solid #003CB4;color:#003CB4;" +
      "padding:9px 24px;border-radius:6px;font-size:14px;cursor:pointer;margin-bottom:12px';",

    // Assemble
    "    card.appendChild(banner);",
    "    card.appendChild(spinnerWrap);",
    "    card.appendChild(klAuth);",
    "    card.appendChild(altBtn);",
    "    overlay.appendChild(card);",
    "    var klAnchor = document.querySelector('.fr-field, .callback, .form-group, .fr-center-card .card-body');",
    "    if (klAnchor) {",
    "      klAnchor.parentNode.insertBefore(overlay, klAnchor);",
    "      klAnchor.style.display = 'none';",
    "    } else {",
    "      document.body.appendChild(overlay);",
    "    }",

    // Callback slot discovery — AIC names inputs 'callback_N' sequentially.
    // We find our two NameCallback slots at runtime so the indices are not
    // hardcoded and remain correct if Page Node structure changes.
    // Strategy: our script runs AFTER all callbacks are rendered; we scan
    // inputs in reverse — our two NameCallbacks are the last empty ones.
    "    var _allCbEls = document.querySelectorAll('input[name^=\"callback_\"]');",
    "    var _emptyCbs = [];",
    "    for (var _ci = 0; _ci < _allCbEls.length; _ci++) {",
    "      if (_allCbEls[_ci].value === '') { _emptyCbs.push(_allCbEls[_ci].name); }",
    "    }",
    "    var KL_CB_JWT    = _emptyCbs[_emptyCbs.length - 2] || 'callback_2';",
    "    var KL_CB_STATUS = _emptyCbs[_emptyCbs.length - 1] || 'callback_3';",

    // submitForm
    "    function klSet(name, value) {",
    "      var el = document.querySelector('[name=\"' + name + '\"]');",
    "      if (!el) { return; }",
    "      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;",
    "      setter.call(el, value);",
    "      el.dispatchEvent(new Event('input',  { bubbles: true }));",
    "      el.dispatchEvent(new Event('change', { bubbles: true }));",
    "    }",
    "    var submitted = false;",
    "    function submitForm(jwt, status) {",
    "      if (submitted) { return; }",
    "      submitted = true;",
    "      klSet(KL_CB_JWT,    jwt    || '');",
    "      klSet(KL_CB_STATUS, status || '');",
    "      setTimeout(function () {",
    "        var btn = document.querySelector('button[type=submit],input[type=submit],#loginButton_0');",
    "        if (btn) { btn.click(); }",
    "      }, 300);",
    "      setTimeout(function () {",
    "        var el = document.getElementById('kl-auth-overlay');",
    "        if (el && el.parentNode) { el.parentNode.removeChild(el); }",
    "        var th = document.querySelector('style[data-kl-auth]');",
    "        if (th && th.parentNode) { th.parentNode.removeChild(th); }",
    "      }, 800);",
    "    }",

    // showBanner helper
    "    function showBanner(msg, isSuccess) {",
    "      banner.textContent      = msg;",
    "      banner.style.background = isSuccess ? '#f0fff4' : '#fff0f0';",
    "      banner.style.color      = isSuccess ? '#27ae60' : '#c0392b';",
    "      banner.style.border     = isSuccess ? '1px solid #b2dfdb' : '1px solid #f5c6c6';",
    "      banner.style.display    = 'block';",
    "    }",

    // Button handler
    "    altBtn.addEventListener('click', function () { submitForm('', 'cancelled'); });",

    // finished — biometric succeeded
    "    var finishedFired = false;",
    "    klAuth.addEventListener('finished', function (e) {",
    "      finishedFired = true;",
    "      var jwt = (e.detail || {}).transactionJWT || '';",
    "      showBanner('Verification successful! Signing you in\u2026', true);",
    "      altBtn.disabled = true;",
    "      setTimeout(function () { submitForm(jwt, 'success'); }, " + FINISHED_SUBMIT_DELAY_MS + ");",
    "    });",

    // error — biometric failed
    "    var errorFired = false;",
    "    klAuth.addEventListener('error', function (e) {",
    "      errorFired = true;",
    "      var d = e.detail || {};",
    "      showBanner(d.message || 'Verification failed.', false);",
    "      setTimeout(function () { submitForm('', 'error:' + (d.code || 'UNKNOWN')); }, " + ERROR_SUBMIT_DELAY_MS + ");",
    "    });",

    // close
    "    klAuth.addEventListener('close', function () {",
    "      if (finishedFired || errorFired) { return; }",
    "      submitForm('', 'cancelled');",
    "    });",

    // Load SDK — skip injection if custom element already registered (retry case)
    "    if (typeof customElements !== 'undefined' && customElements.get('kl-auth')) {",
    "      document.getElementById('kl-auth-loading').style.display = 'none';",
    "      klAuth.style.display = 'flex';",
    "    } else {",
    "      var sdk = document.createElement('script');",
    "      sdk.type    = 'module';",
    "      sdk.src     = '" + esc(SDK_MAIN_URL) + "';",
    "      sdk.onload  = function () {",
    "        document.getElementById('kl-auth-loading').style.display = 'none';",
    "        klAuth.style.display = 'flex';",
    "      };",
    "      sdk.onerror = function () {",
    "        showBanner('Failed to load the biometric module. Please refresh.', false);",
    "      };",
    "      document.head.appendChild(sdk);",
    "    }",
    "  }",

    "  if (document.readyState === 'loading') {",
    "    document.addEventListener('DOMContentLoaded', init);",
    "  } else { init(); }",
    "}());"
  ]).join("\n");
}

//// UTILITIES
// ─────────────────────────────────────────────────────────────
//  maskUser — partial-mask a username for log output (PII hygiene)
// ─────────────────────────────────────────────────────────────
function maskUser(u) {
  var s = String(u || "");
  return s.length > 3 ? s.substring(0, 3) + "***" : "***";
}

// ─────────────────────────────────────────────────────────────
//  checkEnrollmentStatus  — returns true if user is enrolled
// ─────────────────────────────────────────────────────────────
function checkEnrollmentStatus(username) {
  try {
    var url      = P1R_ENROLL_CHECK_URL + encodeURIComponent(username);
    var response = httpClient.send(url, {
      method  : "GET",
      headers : { "Kl-Api-Key": P1R_API_KEY }
    }).get();
    if (response.status === 200) {
      var body = JSON.parse(response.text());
      return { success: true, isEnrolled: (body.isEnrolled === true) };
    }
    logger.error("[P1RecognizeAuth] enrollment check HTTP " + response.status + " user=" + maskUser(username));
    return { success: false };
  } catch (e) {
    logger.error("[P1RecognizeAuth] enrollment check exception: " + e);
    return { success: false };
  }
}

// ─────────────────────────────────────────────────────────────
//  verifyTransactionJwt  — server-side JWT verification
// ─────────────────────────────────────────────────────────────
function verifyTransactionJwt(jwt) {
  try {
    var response = httpClient.send(P1R_VERIFY_URL, {
      method  : "POST",
      headers : { "Content-Type": "application/json", "X-Api-Key": P1R_API_KEY },
      body    : JSON.stringify({ message: jwt })
    }).get();

    if (response.status === 200) {
      return { verified: true };
    }
    logger.error("[P1RecognizeAuth] verify HTTP " + response.status);
    return { verified: false, error: "HTTP_" + response.status };
  } catch (e) {
    logger.error("[P1RecognizeAuth] verify exception: " + e);
    return { verified: false, error: String(e) };
  }
}

// ─────────────────────────────────────────────────────────────
//  outcomeForErrorCode
// ─────────────────────────────────────────────────────────────
function outcomeForErrorCode(code) {
  var i;
  for (i = 0; i < LOCKOUT_CODES.length; i++) {
    if (LOCKOUT_CODES[i] === code) { return NODE_OUTCOME.LOCKOUT; }
  }
  for (i = 0; i < RETRY_CODES.length; i++) {
    if (RETRY_CODES[i] === code) { return NODE_OUTCOME.RETRY; }
  }
  return NODE_OUTCOME.ERROR;
}

//// MAIN
// ─────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────
(function () {

  // ── First pass: serve the biometric UI ─────────────────────
  if (callbacks.isEmpty()) {
    var username = nodeState.get("username");
    if (!username) {
      logger.error("[P1RecognizeAuth] 'username' not found in nodeState — ensure a Platform Username node precedes this node.");
      action.goTo(NODE_OUTCOME.ERROR);
      return;
    }
    // Check enrollment status before showing biometric UI
    var enrollCheck = checkEnrollmentStatus(username);
    if (!enrollCheck.success) {
      logger.error("[P1RecognizeAuth] could not verify enrollment status for user=" + maskUser(username));
      action.goTo(NODE_OUTCOME.ERROR);
      return;
    }
    if (!enrollCheck.isEnrolled) {
      logger.warn("[P1RecognizeAuth] user not enrolled user=" + maskUser(username));
      action.goTo(NODE_OUTCOME.NOT_ENROLLED);
      return;
    }
    callbacksBuilder.scriptTextOutputCallback(buildClientScript(username));
    callbacksBuilder.nameCallback(CB_JWT_ID);
    callbacksBuilder.nameCallback(CB_STATUS_ID);
    return;
  }

  // ── Second pass: process the biometric result ───────────────
  var username       = nodeState.get("username");
  var cbs            = callbacks.getNameCallbacks();
  var returnedJwt    = String(cbs.get(0) || "");
  var returnedStatus = String(cbs.get(1) || "");

  // Cancelled or timed out
  if (returnedStatus === "" || returnedStatus === "cancelled") {
    action.goTo(NODE_OUTCOME.RETRY);
    return;
  }

  // Client-side error with Keyless error code
  if (returnedStatus.indexOf("error:") === 0) {
    var code = returnedStatus.substring(6);
    logger.error("[P1RecognizeAuth] client error: " + code + " user=" + maskUser(username));
    action.goTo(outcomeForErrorCode(code));
    return;
  }

  // Success — verify the JWT server-side
  if (returnedStatus === "success" && returnedJwt) {
    nodeState.putShared("p1RTransactionJwt", returnedJwt);

    if (VERIFY_JWT_ENABLED) {
      var result = verifyTransactionJwt(returnedJwt);
      if (result.verified) {
        nodeState.putShared("p1RAuthStatus", "verified");
        logger.info("[P1RecognizeAuth] success user=" + maskUser(username));
        action.goTo(NODE_OUTCOME.SUCCESS);
      } else {
        logger.error("[P1RecognizeAuth] JWT not verified user=" + maskUser(username) + ": " + result.error);
        nodeState.putShared("p1RAuthStatus", "unverified");
        action.goTo(NODE_OUTCOME.ERROR);
      }
    } else {
      nodeState.putShared("p1RAuthStatus", "unverified");
      action.goTo(NODE_OUTCOME.SUCCESS);
    }
    return;
  }

  // Catch-all
  logger.error("[P1RecognizeAuth] unexpected status=" + returnedStatus + " user=" + maskUser(username));
  action.goTo(NODE_OUTCOME.ERROR);

}());
