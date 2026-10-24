---
status: deprecated
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/ops/PromoteOps.ts
  - src/cli/promote/**
---

# Promote compares and applies configuration in the CLI (deprecated)

## Context and problem statement

`frodo promote` compares a configuration export with a directory of configuration and applies the additions, changes and deletions. The comparison (hashing, deciding what is added, changed or deleted, the checks per entity type) is configuration logic with nothing specific to a terminal, but it lives in the CLI (umbrella 0001). The library has `EnvPromotionOps`, which is a different feature (the platform's environment promotion API). Measured on `main` (75c58f4c, 2026-10-24).

## Decision

Deprecated and not extended: new promotion behaviour (new entity types, new effects) is built library first.

### Evidence

- `src/ops/PromoteOps.ts`: 1,306 lines, 21 functions, 1,041 lines inside functions, 102 logic indicators (the most of any ops module); the single command `src/cli/promote/promote.ts` calls it.
- Its biggest functions are `deleteSwitch` (299 lines) and `compareExportToDirectory` (108 lines), plus `checkChange` and the per-type effect handlers.
- No library counterpart.

## Consequences

- No other consumer can compare or promote configuration.
- Entity-specific knowledge is duplicated with the config-manager and import code.

### Remediation

Direction only; not scheduled. Move the comparison and effect planning into the library as functions that take an export and a set of files and return a plan; the CLI prints the plan, asks for confirmation and applies it through the facade. Size L. Additive for the library; the command's behaviour must not change.
