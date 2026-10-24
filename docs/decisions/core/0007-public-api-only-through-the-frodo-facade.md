---
status: accepted
date: 2026-10-22
decision-makers:
  - maintainers
applies-to:
  - src/index.ts
issues:
  - rockcarver/frodo-lib#760
  - rockcarver/frodo-lib#761
  - rockcarver/frodo-lib#762
  - rockcarver/frodo-cli#863
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# The public API is only the frodo facade

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

frodo-lib exported dozens of loose functions and constants from its package root next to the `frodo` facade. Two ways to reach one capability made the API hard to document, to evolve and to expose safely (for example through the MCP server).

This follows from 0001 (the library is the brain, the CLI a thin wrapper): if every consumer reaches the library through one facade, that facade has to be the whole public surface.

## Decision

- frodo-lib's package root exports only `frodo`, `state`, `FrodoError` and types. Every capability is a method on the `frodo` facade, registered in `src/lib/FrodoLib.ts`.
- frodo-lib enforces this with a test of the root's runtime exports and a lint rule against `export *` of values.
- frodo-cli imports library values only from those three exports, enforced by an ESLint rule.
- Removing or deprecating a public function is a migration item in `MIGRATION.md`.

## Consequences

- The former function and constant exports of the package root were removed in the 5.0.0 prereleases, a breaking change.
- A new capability is never added at the package root. It is a facade method.
