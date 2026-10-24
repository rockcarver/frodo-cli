---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/ops/McpServerOps.ts
  - src/cli/mcp/**
---

# The MCP HTTP server stays on loopback until it is given a token

## Context and problem statement

`frodo mcp server start --transport http` authenticates to the tenant once at startup, and every request it accepts then runs with those credentials. A listening port is therefore privileged. The security model is described in the README ("HTTP transport security model") and `docs/MCP_CLIENT_SETUP.md`; the server is part of the CLI's interface-specific stacks (record 0007). Recorded retroactively and checked against the code on `main` (75c58f4c, 2026-10-24).

## Decision

- The safe path is the default path: the server binds `127.0.0.1` on port 6277 and needs no setup there. Nothing is exposed without deliberate configuration.
- `Host` and `Origin` headers are validated against the localhost set (a foreign `Host`, the shape of a DNS-rebinding attack, is answered with 403); `--allowed-hosts` extends the set.
- Binding a non-loopback address without a token (`--mcp-auth-token` or `FRODO_MCP_AUTH_TOKEN`) refuses to start. `--allow-unauthenticated` is the explicitly named escape hatch.
- A configured token is required as a bearer token on every `POST /mcp` and compared timing-safely; failures get 401 with a `WWW-Authenticate` challenge. `GET /health` stays open and answers only a fixed status. The token is never logged.
- Request bodies and concurrent requests are capped (1 MiB and 64 by default) and over-limit requests are answered, not queued. The transport keeps no sessions.
- The shared-secret mode and the per-request OAuth resource-server mode (`--oauth-resource-server`) are mutually exclusive: a server is one or the other.

## Consequences

- Measured: the code has `isLoopbackBindHost`, the `--allow-unauthenticated` flag, and the mutual-exclusion check in `server-start.ts`.
- Anyone widening the default bind or relaxing the token rule needs a new record.
