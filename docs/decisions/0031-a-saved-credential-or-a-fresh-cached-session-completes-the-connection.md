---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/utils/interactive/**
issues:
  - rockcarver/frodo-cli#920
---

# A saved credential or a fresh cached session completes the connection

## Context and problem statement

Record 0030 says a saved profile for the host completes the connection, but the prompt logic only counted a username with a password, a service account or an Amster key. A profile saved by a browser login holds a username and no password, so every later command opened the Connection page, although the session cache exists so that such a command can run on the browser session it already has. The same page opened for a profile that names browser login as its saved preference.

## Decision

- A saved profile completes the connection when it holds a username with a password, a service account, an Amster private key, or a saved default credential of `browser`, `svcacct` or `amster`.
- A valid cached browser session for the host completes the connection, whether or not the command line names `--browser`, unless the profile saves `user` as its default credential: the library does not reuse a session then.
- A cached session is valid when the library would reuse it: the same freshness rule as the cache read, which requires 30 seconds of headroom. A session that expires sooner does not count. The library answers this; the prompt logic never reads the cache or decides expiry.
- A session that stops being valid between that check and the run is the library's to handle: it refreshes it or falls back to its own login. Interactive mode does not prompt late.
- `--browser` and `--device` on any command other than `frodo login` reuse a valid cached session and start a login only when there is none. `frodo login --browser` always performs a fresh login.
- `--credential user` and `--force-login-as-user` still prompt, as record 0030 requires. A username-only profile with none of the sources above stays incomplete: the Connection page opens.

## Consequences

- The cache is looked up with the full host URL, resolved from the saved profile when the command names an alias; an alias is never the cache key. The deployment type is needed to apply a session, not to find it: it comes from the profile or the anonymous probe.
- The library exposes a read-only check for a reusable cached browser session. The prompt logic calls it and ships after the library release that adds it.
- Tests: the library tests the freshness rule, the alias and URL lookups and the probe; the cli tests the profile rules, including a saved default of `browser` and a username-only profile, in unit and terminal tests. A cached session is only shown end to end against a live tenant. `docs/BROWSER_LOGIN.md` describes the rule.
- Not decided: whether a session with an expired access token and a valid refresh token counts. Today it is not reused, so it does not count.

## Alternatives considered

- The prompt logic reads the cache and checks expiry itself: rejected, it duplicates the library's freshness rule and drifts from it.
- Always prompt for a username-only profile: rejected, it makes the session cache pointless for the profiles browser login creates.
