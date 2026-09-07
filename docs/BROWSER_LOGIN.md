# Browser Login

`frodo login --browser` (and the `--browser`/`--device` flags every other command also accepts) authenticates through a real interactive browser flow instead of a username and password on the command line. This is useful when you don't want to type or script a password at all, when your login journey requires MFA/WebAuthn/federation that CLI-only mode can't drive, or when you'd rather delegate to whoever is sitting at the browser.

## Supported deployment types

| Deployment type | Status |
| --- | --- |
| `cloud` (PingOne Advanced Identity Cloud) | Supported |
| `forgeops` | Supported |
| `classic` | Supported (session-capture script required — see below) |

## Quick start

```console
# Cloud
frodo login --browser --type cloud https://openam-example.forgeblocks.com/am --save

# ForgeOps, loopback redirect
frodo login --browser --login-client-id my-browser-client --type forgeops https://openam.example.com/am --save

# ForgeOps, device authorization grant (for headless/SSH sessions with no local browser)
frodo login --device --login-client-id my-browser-client --type forgeops https://openam.example.com/am --save

# Classic (requires the session-capture script — see below; there is no fallback)
frodo login --browser --login-client-id my-browser-client --type classic https://openam-classic.example.com:8080/am --save
```

`--save` persists a connection profile so later commands (`frodo journey list <host>`, etc.) reuse the same login mode without repeating `--browser`. Every other `frodo` command also accepts `--browser`/`--device` directly, so `frodo conn save --browser ...` works the same way.

Cloud uses a fixed, built-in OAuth2 client and needs no further setup — just `--browser`/`--device` and a `--type cloud` host. ForgeOps and classic are fully customer-controlled and need the setup below.

## ForgeOps setup

### 1. Register an OAuth2 client

Create a public OAuth2 client in the realm your admin (or delegated end-user) login journey lives in. It needs:

- The authorization code grant with PKCE, and/or the device authorization grant if you want `--device` to work.
- A loopback redirect URI. Frodo binds an ephemeral local port by default (`http://127.0.0.1:<port>`) and sends back the exact `redirect_uri` it used, so a wildcard/pattern-matched registration (e.g. `http://127.0.0.1:*`, if your AM version supports it) covers it. If your client's redirect URI must instead be registered as one exact, literal value, pass `--login-redirect-uri` with that exact value — its port is used for the local listener, and the URI itself is sent to AM verbatim rather than reconstructed. (PingOne Advanced Identity Cloud's own built-in browser-login client needs exactly this: AM only accepts its one registered, literal redirect URI, no wildcard support — confirmed empirically, not assumed.)
- Scope `openid fr:idm:*` by default (override with `--login-scope`).

### 2. Recommended: the session-capture script

AM's OAuth2 scripting API exposes a `session` binding to legacy-evaluator scripts in the `OAUTH2_ACCESS_TOKEN_MODIFICATION` context — a real `SSOToken` whose `getTokenID()` is the tenant's actual, literal AM session token id. Attaching a script that captures it onto your client's token response is the recommended way to unlock AM-domain operations (config export/import, journeys, scripts, and everything else that isn't IDM), because it hands Frodo a genuine session cookie and lets every one of Frodo's existing session-based AM code paths run completely unchanged — no guessing whether AM will accept a bearer token.

On the client, set:

```json
{
  "overrideOAuth2ClientConfig": {
    "providerOverridesEnabled": true,
    "accessTokenModificationPluginType": "SCRIPTED",
    "accessTokenModificationScript": "<your-script-id>"
  }
}
```

And the script itself (legacy evaluator, `OAUTH2_ACCESS_TOKEN_MODIFICATION` context):

```javascript
accessToken.addExtraData('sessionId', session.getTokenID());
```

This only captures the identity of whoever authenticates through *that specific client*, in *that client's realm* — exactly the behavior you want for both an admin client and a separate, more restricted delegated-user client. Frodo detects the `sessionId` field on the token response automatically; no CLI flag is needed to opt in.

### Fallback: bearer-token model (no script)

If you'd rather not touch AM scripting, Frodo falls back to a two-tier bearer-token model automatically when no `sessionId` is present on the token response:

- **Tier A — IDM-domain operations**: always works. IDM is a genuine OAuth2 resource server, so the bearer token is used directly.
- **Tier B — AM-domain operations**: unverified/best-effort. AM's REST API is not resource-server-protected by default, so whether it accepts a bearer token at all depends on your AM configuration. Frodo probes this once per session (a single cheap authenticated read) and prints a clear warning if AM rejects it, rather than letting every subsequent AM call fail with an opaque 401.

The session-capture script avoids this uncertainty entirely, so it's the recommended path even though the fallback exists.

## Classic setup

Classic has no bearer-token concept at all today — it's session-cookie only. Browser login on classic therefore supports **only** the session-capture script (step 2 above); there is no bearer-token fallback, because classic has no IDM to fall back to for Tier A the way ForgeOps does. A token response with no `sessionId` fails with a clear error rather than silently leaving you with a session that can't do anything.

Two differences from the ForgeOps setup above:

- Classic doesn't ship AM's OAuth2 Provider service enabled by default the way cloud does — enable it first, then follow ForgeOps's client-registration and script steps.
- Use scope `openid` (the default if you omit `--login-scope`) rather than `openid fr:idm:*` — classic has no IDM-domain scope to request.

## Device flow

`--device` uses the OAuth2 Device Authorization Grant instead of a loopback redirect — useful for headless or SSH sessions with no local browser to open. It requires your OAuth2 provider to have the device grant enabled on the client; this is optional, not required, for browser login to work.

## Login journey configuration

Because this is a real interactive login through an actual browser (or another device, for the device flow), your realm's login journey can include MFA, WebAuthn, or federation steps the way it would for any other user-facing login — none of the `checkAndHandle2FA` limitations that apply to CLI-only mode (which can't drive a WebAuthn ceremony or a federation redirect) apply here.
