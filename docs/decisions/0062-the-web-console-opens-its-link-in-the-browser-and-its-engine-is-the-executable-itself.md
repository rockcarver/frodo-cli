---
status: proposed
date: 2026-11-21
decision-makers: maintainers
applies-to:
  - src/app.ts
  - src/cli/shell/**
  - src/ops/ShellWebServerOps.ts
  - src/ops/ShellWebPage.ts
  - src/ops/AuthenticateOps.ts
---

# The web console opens its link in the browser and its engine is the executable itself

## Context and problem statement

[The web console is a privileged loopback server behind a one-time link](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0060-the-web-console-is-a-privileged-loopback-server-with-a-one-time-link.md) prints the one-time link and gives each browser tab its own engine process. It did not decide two things that showed when the console ran from the native binary. The engine was started as `node worker-file`, but the executable of a native binary always runs its embedded program and reads a script path as a command, so every tab failed with "Internal error" and the page asked again at once, starting a process per answer. And the help said the console opens in a browser while nothing opened it. On 2026-11-21 the maintainers decided that the binary runs itself as the engine and that the console opens the browser by default, with the off switch of the browser login.

Opening the browser hands the link to a launcher process as an argument, which other processes of the machine can read while it lives.

## Decision

- **The engine in the binary is the executable itself.** In the native binary the console starts each tab engine as its own executable with no argument and a private environment variable, an internal switch between the console and its child that no option, help text or user document offers. `src/app.ts` runs the engine in place of the command line parser when the variable is set. The engine removes the variable from its own environment before anything else, so a command that a script of the console starts is an ordinary command and never another engine. Everywhere else (npm, Docker, from source) the engine stays `node` and the worker file, and the variable is never passed on. The process per tab, the protocol and every check of the web console record above are unchanged.
- **`frodo shell --web` opens the default browser with the link unless `--no-open` is given.** It is the option and the launcher of the browser login, shared, not a second copy. The link is always printed first and the launcher is asked after; a launcher that cannot start is said and never fails the command. Tests never open a real browser: they pass `--no-open` or put a stub launcher alone on the `PATH`.
- **The exposure of the link to the launcher is accepted.** The link is dead once the browser has asked for it, a second use is answered with 403, and a thief who wins that race leaves the person a page that says the link was used. A process of the same user can already read the console's credentials. The one added reader is another user of a shared machine, who can reach the loopback port too, and for that machine `--no-open` is the remedy and the documentation says so. The ways that hide the link from the launcher (a fragment the page posts, a form, a file) need an unauthenticated page or a file, which relaxes that record and still leaves the address in the arguments, so they are rejected.
- **An engine that never came up is the only detail of a failure that leaves the server.** When an engine process cannot start or ends before it answers, the server answers 503 with one line of what the process wrote to its error output (the first line that names an error, cleaned of control characters, at most 200 characters, secrets scrubbed) and nothing else. The terminal prints that line once per reason, and the engine is forgotten. The page waits between its asks, longer each time. Any other internal failure stays "Internal error".

## Consequences

- Tests keep the rules checkable: the command of the engine per environment, the engine as a real process (worker mode, the variable removed, a command started from it is ordinary), the opener called once with the printed link and not with `--no-open`, the 503 and its single terminal line, the page's pause, and the browser test with a mock keychain and cleanup of the browser's process group. The suite runs against the binary with `FRODO_TEST_BINARY=sea`.
- `docs/SHELL.md`, `docs/BUILD-ENV.md` and `MIGRATION.md` say what opens, what `--no-open` does and how the binary starts its engines.
- "Opened" means the launcher started: a launcher that starts and then fails on its own is not seen.
- A new way to hand the link on, or a reason shown to the page beyond the one above, needs a new record.

## Alternatives considered

- Engines as threads of the console process: rejected, a library `state` is process-wide, so two environments would share credentials.
- A second executable or the worker file beside the binary: rejected, one more file to ship, sign and keep in step with the binary.
- Not opening by default: rejected by the maintainers, the help had promised it.
