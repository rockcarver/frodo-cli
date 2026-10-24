---
status: proposed
date: 2026-10-24
decision-makers:
  - maintainers
issues:
  - rockcarver/frodo-lib#783
  - rockcarver/frodo-cli#887
  - rockcarver/frodo-cli#896
  - rockcarver/frodo-cli#898
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Let the callback handler return a promise

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

frodo-lib asks its caller for the MFA code through a synchronous `CallbackHandler`. The CLI therefore reads the terminal with a blocking read, which failed with EAGAIN in 5.0.0-12 (frodo-cli#887). That was fixed in the CLI (#896, and #898 with one shared synchronous stdin helper), but the synchronous contract remains.

The handler is the seam where the library (0001) hands a question to the terminal, which is the CLI's job; it should not dictate how the CLI reads input.

## Decision

Proposed, not yet accepted: widen the type to `(callback) => Callback | Promise<Callback>` and await it in `checkAndHandle2FA`. A synchronous handler keeps working. Afterwards the CLI uses its async prompt and drops the synchronous helper.

## Consequences

- Until accepted, the handler stays synchronous and the CLI reads standard input synchronously only through `src/utils/StdinSync.ts`.
- If accepted, the change is non-breaking for library users: one library release, then the CLI change.
