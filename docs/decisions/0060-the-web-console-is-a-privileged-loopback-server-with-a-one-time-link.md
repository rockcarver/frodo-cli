---
status: accepted
date: 2026-11-11
decision-makers: maintainers
applies-to:
  - src/cli/shell/**
  - src/ops/ShellWebServerOps.ts
  - src/ops/ShellWebEngineOps.ts
  - src/ops/ShellWebPage.ts
  - src/ops/ShellWebSerializeOps.ts
---

# The web console is a privileged loopback server behind a one-time link

## Context and problem statement

`frodo shell` runs JavaScript against the connected environment with its credentials. `--web` serves the same console as a local page, so the scripts no longer run in a terminal but on request from a browser. Whoever can send that server a request can run code with the environment's credentials, exactly as if they had typed it in the terminal; a listening port is therefore a privileged one (compare the MCP server, record 0021). The browser model differs from the MCP server's in one important way: the client is a page the server itself renders, so the server can bind the session to that page instead of asking the user to manage a token.

## Decision

- The server binds the loopback address only. Every request passes the same checks in the same order before any route runs: the `Host` header must name this server (a foreign host is the shape of a DNS-rebinding attack and is answered with 403); an `Origin` header, when present, must be this server's own origin, and a `null` origin is refused.
- The page signs in once with a one-time link that frodo prints to the terminal, never to a file or a log. The link's secret is swapped for an HttpOnly, SameSite=Strict session cookie with a bounded lifetime (a working day) and is then dead: a second use of the link is answered with 403.
- Every API call needs the session cookie AND a per-session secret in a custom header. A cross-site page can make a browser send a POST with cookies; it cannot send that header without a CORS preflight this server never grants, and it cannot forge the same-origin `Origin` a write also requires. Writes must be `application/json` and are capped (1 MiB), as is the number of concurrent requests (64).
- Scripts run in Node, never in the browser. The page receives descriptions of values (a tree of previews with ids) and asks for children or JSON over the API; the credentials frodo holds never reach the page. Results are described in a bounded registry: old results are released when new ones arrive, and a released id is answered with 404, not an error.
- The page is one document with its style and script inline, sent with a nonce-based Content-Security-Policy that allows nothing but those two blocks. External resources are permitted only as exact URLs named in the policy, never by whole origin. The page never builds markup from data: everything from a script or a tenant reaches the document through text nodes.
- Secrets are compared in constant time, are never logged, and internal failures are never described to the caller (a 500 says "Internal error").
- Each browser tab gets its own engine as a child process of the server: a frodo-lib `state` is process-wide, so two environments cannot share one process without scripts reading each other's credentials. The tab keeps its engine id in its sessionStorage and carries it on every request; the session cookie stays shared, the engines are not. An engine runs its operations one at a time in arrival order, and dies with the server.
- A console started without a host can connect from the page: a picker lists the saved connection profiles (hosts and aliases only; profile secrets never reach the browser), and connecting posts one host through the same write path as every other API call. The login itself runs in Node with the profile's saved credentials, exactly as the command line would. Only a host that names a saved profile can be picked. A profile whose saved preference is a browser login (and which holds no service account) is marked in the picker, so the click that opens a browser is explained before it happens; the engine child's stderr, where the login progress is printed, joins the tab's log stream for the same reason.
- The terminal console stays the default; `--web` only changes where it runs (2026-11-17: the two commands merged into one, `frodo shell`, after the web console briefly shipped as a separate `frodo console` command; web mode never prompts on the command line, the worker signs in from the named or picked profile). Both share the same engine and the same `$` facade. Command history is the person's, not the tenant's: every web tab writes one shared file, so all tabs and all connections see the same history (the terminal keeps its per-host files). A tab refreshes its snapshot when it regains focus.
- The page may load an editor from a CDN, but only pinned: each file is named by one exact URL with its content hash in an `integrity` attribute, the same URLs are the only external entries in the CSP, and the page keeps its plain textarea when the files do not arrive. A new URL or hash is a change to this record's spirit: recompute the hash and review what the file does.

## Consequences

- The checks live in one place (the route guard of `ShellWebServerOps.ts`); a new route inherits them by construction. A test suite covers each check individually (Host, Origin, one-time link, cookie/header split, JSON-only writes, caps, CSP, no CORS, no secret leakage).
- Anyone widening the bind, relaxing a check, or loading a new external resource needs a new record: the CSP names exact URLs so a CDN's other files never become part of this page's trust.
- The engine holds a real REPL in Node; its domain-based error routing (an undocumented REPL option) is asserted at startup so a Node change fails loudly instead of silently losing errors.
- The console's credentials outlive the page (a working day): closing the tab does not revoke them. The server's lifetime is the `frodo shell --web` process; stopping it ends everything.

## Alternatives considered

- Requiring a token like the MCP server: rejected for v1, because a page cannot hold a bearer token without exposing it to scripts; the cookie-plus-header split gives the same protection without putting a secret where page code can read it.
- Running the scripts in the browser and proxying only REST calls: rejected, because frodo's credential model lives in Node and shipping tokens to the page would defeat the design.
- Serving the page as separate files: rejected, because the single-file binary could not locate them; the document ships in the bundle.
