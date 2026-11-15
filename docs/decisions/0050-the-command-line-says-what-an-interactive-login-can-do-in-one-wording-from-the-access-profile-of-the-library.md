---
status: proposed
date: 2026-11-14
decision-makers: maintainers
applies-to:
  - src/utils/AccessProfileText.ts
  - src/utils/AccessCommandAreas.ts
  - src/utils/AccessErrorAdvice.ts
  - src/cli/info/info.ts
  - docs/BROWSER_LOGIN.md
issues:
  - rockcarver/frodo-cli#1315
---

# The command line says what an interactive login can do, in one wording, from the access profile of the library

## Context and problem statement

A browser or device login on a Cloud tenant reaches less than a service account, and the two flows differ: on 2026-11-14 a device login could not reach Access Management at all, and neither flow reached a dozen other areas. frodo-lib adapts the login to the tenant and reports an access profile of every session (core 0001: the library is the brain). The command line said nothing, so a person found out when a command failed with a message about a scope.

## Decision

- **The wording comes from one module, `src/utils/AccessProfileText.ts`,** built from the library's access profile (`frodo.login.getAccessProfile()`). The command line never works out reach itself, and never re-implements the library's scope rules.
- **Five places say it, with the same words:** the notice after a new interactive login, `frodo info` (human output, and `accessProfile` in the JSON), `frodo conn describe` (the saved session of the host, read from the token cache without a login), the line that follows a scope error, and the help of the commands that no interactive login can run. The capability matrix in `docs/BROWSER_LOGIN.md` has the same wording.
- **The notice is for a person.** It follows a login that was just done, once per process; it is not shown for a session reused from the cache, when stdout is not a terminal, or when the command prints for a program (`--json`, `--scriptFriendly`). `info` and `conn describe` show the profile of an interactive login only; a service account, a user session and a deployment without a profile print what they always printed.
- **A command gets the note in its help only when it always needs an area that no interactive login reaches.** `COMMAND_AREAS` in `src/utils/AccessCommandAreas.ts` says what each command needs; a command that touches many sections is `general` and reports a section it cannot reach by name when it runs. A command is never hidden or refused because of its login: the library refuses it, with a code, when it runs.
- **The tables are checked, not trusted.** A test compares `INTERACTIVE_REACH` with the profile of a real browser session and a real device session of the library, and with the capability matrix; another fails for a command that has no entry in `COMMAND_AREAS`.

## Consequences

- A new command, or a new area in the library, fails a test until it is decided. A command that a device login cannot run only because it has no Access Management session carries no note in its help (that would touch most commands); the notice, `info` and the error line say it.
- The advice that follows a scope error is printed once per process, so a bulk operation does not repeat it for every section.
- Not decided: a per-command table instead of one per group, a `--json` option for `conn describe`, and the same text in the MCP server.

## Alternatives considered

- Show the profile only when asked (`frodo info`): a person who has not heard of it learns from a failed command.
- Print the notice after every login, also a cached one: it repeats on every command.
- A note for every command whose area a device login cannot reach: most commands would carry it.
