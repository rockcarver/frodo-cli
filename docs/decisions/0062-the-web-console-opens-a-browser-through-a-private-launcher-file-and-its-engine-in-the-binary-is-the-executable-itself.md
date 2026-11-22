---
status: proposed
date: 2026-11-22
decision-makers: maintainers
applies-to:
  - src/app.ts
  - src/cli/shell/**
  - src/ops/ShellWebServerOps.ts
  - src/ops/ShellWebPage.ts
  - src/ops/ShellWebLauncher.ts
  - src/ops/AuthenticateOps.ts
---

# The web console opens a browser through a private launcher file, and its engine in the binary is the executable itself

## Context and problem statement

[The web console is a privileged loopback server behind a one-time link](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0060-the-web-console-is-a-privileged-loopback-server-with-a-one-time-link.md) guards a console that runs code with the connected environment's credentials, and says the link is printed to the terminal, never to a file or a log. Three things were not decided there. When the console ran from the native binary its engines did not start: the executable of a native binary always runs its embedded program and reads a script path as a command. The help said the console opens in a browser while nothing opened it; on 2026-11-21 the maintainers decided that it does, by default, with the off switch of the browser login. And an address given to the program that opens a browser is an argument of that program: any process of the machine can list the arguments of the others while it runs, and a browser that the program starts may keep them for its whole life.

That exposure was measured on 2026-11-22. An unprivileged watcher that listed arguments saw the link in 91 of 100 launches and used it first in all 91, 11 to 26 ms after the opener started; a stand-in browser asked 40 to 177 ms after. Whoever uses the link first gets the whole console: a session cookie and an engine with the person's saved profiles, that is, code that runs with the person's credentials. A link that nobody uses stays valid until the console's idle shutdown. Process-creation auditing records arguments in a log. The URL of the browser login is a different thing: it holds no secret that signs anyone in (the tenant authenticates the person).

## Decision

- **This record replaces the one above; it restates what stays.** The server binds the loopback address only; every request passes the checks of `Host`, `Origin`, the session cookie (HttpOnly, SameSite=Strict, a working day) and the per-session header, in that order; writes are JSON and capped; scripts run in Node and the page only receives descriptions; the page is one document under a nonce-only policy and loads only pinned, hashed editor files; secrets are compared in constant time and never logged; one engine process per tab; only saved profiles can be picked; the terminal console stays the default.
- **The link.** It is printed to the terminal, always. It never goes to a log, to a command line or to an environment variable, and it goes to a file only when frodo opens the browser itself: one launcher file in a new folder that only the current user can enter (mode 0700, file mode 0600), removed when the link is used, after two minutes and when the console stops, and a file that a killed run left behind is removed at the next start (only our folders, older than ten minutes). The link's secret is swapped for the session cookie and is then dead: a second use is answered with 403. The answer to the first use is a page that goes on to the console, not a redirect, so that a browser sent by another site's page (the launcher file) still sends the cookie.
- **Opening.** `frodo shell --web` opens the default browser unless `--no-open` or `FRODO_BROWSER_LOGIN_NO_OPEN` says not to (both also govern the browser login, which shares the launcher). The opener is given the address of the launcher file and never the link. A launcher that cannot start or ends with an error is said so and never fails the command. The terminal says when a browser signs in, and once after 20 seconds without a sign-in that the printed link works. Tests never open a real browser.
- **The engine in the binary** is the executable itself, started with no argument and a private variable that no option or document offers; it starts as an engine only when its input is not a terminal, removes the variable from its own environment first, and the binary never runs a script that an environment variable names.
- **An engine that never came up is the one exception to the rule that an internal failure is never described.** The signed-in page gets 503 with one line the engine process wrote (the first that names an error, cleaned of control characters, scrubbed of secrets on the whole line, at most 200 characters), the terminal prints it once; any other failure stays "Internal error".

## Consequences

- What stays at risk: a process of the same user, root, or a file-level security agent can read the launcher file for its short life, as they can already read the credentials; the dead link stays in the browser's history. A browser that cannot read the file (one packaged to see only its own files, an editor that handles `.html`, a remote session) shows an error or the source: the printed link and the 20-second reminder are the way out.
- On 2026-11-22 the flow was run end to end in one headless browser of the Chromium family only. Other browsers, packaged browsers and remote sessions are not verified.
- Opening by default is a visible change of a command; [a major release may make it](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md), and `docs/SHELL.md` and `MIGRATION.md` say so. A new way to hand the link on, or a reason shown to the page beyond the one above, needs a new record.

## Alternatives considered

- The link as an argument of the opener (the first form of this record): rejected by the measurement above. A short-lived token for the opener alone, or a check of the first request, narrow the window or fail against a local user, and do not stop the race.
- A short code that the person types into the terminal (the device flow): no secret in any address, but a prompt on a complete command line and a typing step on every run. It is the fallback if launcher files turn out to fail often.
- Refusing a link whose connection belongs to another operating-system user: possible later, if the system should enforce "same user" whatever leaks. Not opening by default: rejected by the maintainers. Engines as threads, or a second executable: rejected, one process-wide state per environment, one more file to ship.
