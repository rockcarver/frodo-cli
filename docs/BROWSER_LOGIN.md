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
# Cloud (the deployment type is detected from the host, see below)
frodo login --browser https://openam-example.forgeblocks.com/am --save

# ForgeOps, loopback redirect
frodo login --browser --login-client-id my-browser-client --type forgeops https://openam.example.com/am --save

# ForgeOps, device authorization grant (for headless/SSH sessions with no local browser)
frodo login --device --login-client-id my-browser-client --type forgeops https://openam.example.com/am --save

# Classic (requires the session-capture script — see below; there is no fallback)
frodo login --browser --login-client-id my-browser-client --type classic https://openam-classic.example.com:8080/am --save
```

`--save` on `frodo login` persists a connection profile so later commands (`frodo journey list <host>`, etc.) reuse the same login mode without repeating `--browser` — this sets the profile's `--preferred-credential` to `browser`, since asking `login` to both authenticate interactively and remember it *is* the explicit "remember this" request. Every other `frodo` command accepts `--browser`/`--device` too, but only for that one invocation; an unrelated command's own `--save`-like behavior never infers a persisted preference from that on its own. To make browser login the persisted default from a command other than `login`, pass `--preferred-credential browser` explicitly, e.g. `frodo conn save --preferred-credential browser <host>`.

`--preferred-credential` (`user`/`svcacct`/`amster`/`browser`) is the one persisted preference for which credential type later implicit commands against a host should use — it replaces the old `--default-credential`, now also covering browser login. View or change it at any time with `frodo conn <host>` (an interactive picker offering only what that profile actually has configured) or `frodo conn save --preferred-credential <type> <host>` directly. For device flow specifically, `--preferred-device-flow`/`--no-preferred-device-flow` on `conn save` persists that choice too, so a headless/SSH profile doesn't need `--device` repeated on every command.

Cloud uses a fixed, built-in OAuth2 client and needs no further setup — just `--browser`/`--device` and the host. ForgeOps and classic are fully customer-controlled and need the setup below.

## How frodo finds the deployment type and your session

`--type` is optional with `--browser`/`--device`. frodo takes the deployment type from, in this order:

1. `--type` (or `-m`), which always wins and is never second-guessed;
2. the connection profile saved for the host, whether you name the host by URL, alias or a unique part of it;
3. an anonymous check of the host: two requests to `/oauth2/authorize` with the built-in admin client ids, no credentials. Cloud and ForgeOps are recognised by their built-in OAuth2 clients, classic when both clients are unknown to an AM. A host that does not answer, or does not look like an AM, gives no type, and the command fails with a message that says to pass `--type` or save a profile.

The check is skipped whenever 1 or 2 give a type. It times out after 8 seconds. Pass `--type` when the host cannot be reached without credentials (a gateway that needs headers, for example) or when you prefer not to make the extra requests; a saved profile keeps the headers and the `--insecure` setting for the host.

With `--browser`/`--device`, or for a profile that prefers browser login, every command except `frodo login` reuses a valid cached browser session for the host and opens the browser only when there is none. `frodo login --browser` always performs a fresh login. A session is valid while it has more than 30 seconds left, and it is found under the host's full URL, so naming the host by alias or by a unique part of it finds it as well. See [decision record 0031](decisions/0031-a-saved-credential-or-a-fresh-cached-session-completes-the-connection.md) for when a saved profile or a cached session counts as a complete connection in interactive mode.

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

`--device` uses the OAuth2 Device Authorization Grant instead of a loopback redirect — useful for headless or SSH sessions with no local browser to open. It requires your OAuth2 provider to have the device grant enabled on the client; this is optional, not required, for browser login to work. To persist this as a profile's default (so a headless/SSH host doesn't need `--device` repeated on every command), save it explicitly with `frodo conn save --preferred-credential browser --preferred-device-flow <host>` — see `--preferred-credential` above.

## Login journey configuration

Because this is a real interactive login through an actual browser (or another device, for the device flow), your realm's login journey can include MFA, WebAuthn, or federation steps the way it would for any other user-facing login — none of the `checkAndHandle2FA` limitations that apply to CLI-only mode (which can't drive a WebAuthn ceremony or a federation redirect) apply here.

## Known issues

**Chrome may not complete the loopback redirect.** Confirmed live (2026-09-21) against a real cloud tenant: after granting consent, Chrome (including Incognito, which rules out an extension) never followed the resulting `302` redirect to `http://localhost:<port>` — the tab just stayed on the consent page with no visible error. Network capture confirmed AM's side was correct the whole time: the `/oauth2/authorize` POST returned a well-formed `302` with a valid authorization code to exactly the right `redirect_uri`. Firefox completed the same flow immediately with no changes. The leading theory is Chrome's Private Network Access enforcement silently declining a top-level navigation from a public HTTPS origin to a private/`localhost` target, though this hasn't been confirmed against Chrome's own release notes. If your browser opens automatically but the flow never completes, the CLI always prints the authorize URL too (even on a successful auto-open) — copy it into a different browser rather than assuming the login itself failed.
