---
status: deprecated
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/ops/AdminOps.ts
  - src/cli/admin/**
---

# The admin operations are implemented in the CLI while the library holds a commented-out copy (deprecated)

## Context and problem statement

`frodo admin` finds OAuth2 clients and static user mappings with admin privileges, grants and revokes admin privileges, creates clients and long-lived tokens, hides and shows generic extension attributes and repairs the organisation model. Which scopes and roles count as privileged, which clients are protected and how a mapping is changed are rules about the platform, not about a terminal (umbrella 0001). They are implemented in the CLI; the library's `src/ops/AdminOps.ts` carries about 1,190 lines of the same functions commented out (lines 326 to 1909). Measured on `main` (CLI 75c58f4c, library e79cfa524, 2026-10-24).

## Decision

Deprecated and not extended: new admin behaviour is built library first. Decide what happens to the commented-out block in frodo-lib when the logic moves (see its record 0013).

### Evidence

- `src/ops/AdminOps.ts` in the CLI: 1,412 lines, 27 functions, 1,165 lines inside functions.
- 11 of the 18 `frodo admin` commands call them: `add-autoid-static-user-mapping`, `create-oauth2-client-with-admin-privileges`, `grant-` and `revoke-oauth2-client-admin-privileges`, `hide-` and `show-generic-extension-attributes`, `list-oauth2-clients-with-admin-privileges`, `list-oauth2-clients-with-custom-privileges`, `list-static-user-mappings`, `remove-static-user-mapping` and `repair-org-model`. The other 7 are thin (federation commands over the library's `AdminFederationOps`, the RFC 7523 helpers, `get-access-token`, `train-auto-access-model`).
- The privilege lists (`privilegedScopes`, `privilegedRoles`, `protectedClients`, `protectedSubjects`) are constants in the CLI file.

## Consequences

- A script or the MCP server cannot ask which clients have admin privileges without re-implementing the rules.
- Two copies of the logic exist, one dead.

### Remediation

Direction only; not scheduled. Re-home the functions in the library's `AdminOps` (the commented block is the starting point) and expose them on `frodo.admin`; the CLI keeps printing. Size M. Additive for the library. The capability registry needs reviewed metadata for each new method (lib record 0001); several are mutating and high-risk.
