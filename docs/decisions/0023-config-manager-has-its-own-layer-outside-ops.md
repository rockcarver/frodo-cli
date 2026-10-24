---
status: deprecated
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/configManagerOps/**
  - src/cli/config-manager/**
  - src/utils/FrConfig.ts
---

# The config-manager operations form a layer of their own outside src/ops (deprecated)

## Context and problem statement

Every other command group follows `src/cli` to `src/ops` (record 0007). The config-manager commands were added in January 2026 (first commit 2026-01-25, "Add fr-config-manager pull commands") by a contributor, with their operations in a new folder, `src/configManagerOps/`, beside `src/ops/` instead of inside it. The folder is even listed in `docs/CONTRIBUTE.md` ("Operations behind the config-manager commands"), but no record decided it, and it breaks the layering paradigm. Measured on `main` (75c58f4c, 2026-10-24).

## Decision

The separate layer is deprecated and not extended:

- No new module under `src/configManagerOps/`.
- New config-manager behaviour is built library first and wrapped in `src/ops/` (records 0007, 0024).

### Evidence

- 42 modules, 5,198 lines (3,753 inside functions, 119 functions), named `FrConfig<Entity>Ops.ts`; 93 exported functions named `configManager<Verb><Entity>`, a scheme matching neither CRUDQ nor the command verbs (record 0009).
- Edges: `src/cli/config-manager` imports `configManagerOps` 83 times and `src/ops` 83 times; `configManagerOps` imports `utils` 69 times and itself 31 times and imports `src/ops` zero times. It is a parallel layer, not a user of the ops layer.
- 87 command files (4,626 lines), 72 commits, 87 e2e test files and 92 `-h` snapshot tests.
- Mis-named files: `FrConfigRestartOps.ts.ts` and `FrConfigIdmAuthenticationOpts.ts`.

## Consequences

- A contributor who works on both `src/ops` and config-manager meets two vocabularies and two places for the same kind of code.
- The layer hides how much logic the CLI carries (record 0024).

### Remediation

Direction only; not scheduled. Fold `src/configManagerOps/` into `src/ops/` (for example `src/ops/configManager/`), rename the 93 functions to the verb vocabulary of record 0009, fix the two file names and move the imports of 83 and 31 edges. Mechanical and behaviour-neutral, protected by the 87 e2e and 92 snapshot tests. Size M. It can be done before, with, or after moving the logic into the library (record 0024), but doing it first makes that move easier to review.
