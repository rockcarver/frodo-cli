---
status: accepted
date: 2026-11-06
decision-makers:
  - maintainers
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
applies-to:
  - src/ops/AuthenticateOps.ts
  - src/ops/TokenCacheOps.ts
  - src/mcp/**
  - src/cli/mcp/**
issues:
  - rockcarver/frodo-lib#911
  - rockcarver/frodo-lib#914
  - rockcarver/frodo-lib#906
  - rockcarver/frodo-lib#908
  - rockcarver/frodo-lib#917
---

# The library resolves credentials in one place, behind getTokens()

## Context and problem statement

`getTokens()` was designed as the one call that gives a process a usable credential: use a fresh cached token or session, otherwise log in and cache the result, and keep a long-running process supplied by auto-refresh. When this was decided, on 2026-11-06, the MCP server had switched the cache off because several server processes collided on the one cache file, and its runtime called `getTokens()` for every request. Without the cache every call was a full login, and request-scoped instances left sessions behind. The fix was being sought in the consumer, where the rule did not belong.

## Decision

- **One place.** Login, session and token handling, the token cache, refresh and the rule for when a credential is fresh live in the library's authentication and token cache modules. A consumer (the CLI, the MCP server, a script, an editor extension) calls `getTokens()` through the facade and uses the result. It does not decide whether a login is needed, read or write cache files, or derive cache keys.
- **Resolution order.** `getTokens()` returns, in this order: tokens already on the state that are fresh and belong to the same identity; a fresh entry of the token cache; the result of a new login, which it stores in the cache. Auto-refresh, by timer and on demand at send time, goes through the same call.
- **One freshness rule.** The request interceptors, the cache and the refresh timer use the same buffer before expiry. An unknown expiry is not fresh.
- **Identity.** The in-memory check compares a fingerprint of everything that decides who an instance is: the host, the realm, the deployment type, the credential and the options that choose it. A cache entry is keyed by the host, the realm the credential authenticates against, the kind of token and the subject, and is encrypted with a key derived from the credential, so another credential never reads it. The realm a request is made in is never part of the key, so one session serves every request realm.
- **Switching the cache off is a policy choice,** for example a read-only or ephemeral home. A consumer never switches it off to avoid a defect of the cache: the defect is fixed in the library.
- **Rejection.** A credential that the server rejects (401) is forgotten, in memory and in the cache, and replaced once, unless this process obtained it from the server moments ago: a 401 is also how some APIs refuse a request that is not permitted.
- **Logout.** An operation that ends a session does not end one that was shared through the cache, nor one that the process only restored from the cache. An explicit logout ends the session and evicts the entry. A process may end sessions that it created and did not share.
- An explicit login (`frodo login`, `getTokensInteractive()`) always performs a real login.

## Consequences

- A reviewer asks of any code outside the two modules that logs in, checks token expiry or touches the cache files: why is this not behind `getTokens()`?
- Processes that share a host and identity share one login per expiry window. The price is that a session can be ended while another process still uses it, which the rejection rule absorbs.
- To keep in sync: the MCP server of the CLI does not hard-code the cache off; the library's records on shared state files (the token cache and the connection profiles file) say how they are written.

## Alternatives considered

Each consumer decides when to log in again: every consumer repeats the identity and freshness rules, and the MCP runtime would hold a second copy of them. A session per process without a cache: the processes of one identity each log in, and a long-running process still needs refresh.
