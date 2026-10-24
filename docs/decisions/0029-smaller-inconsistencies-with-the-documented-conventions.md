---
status: deprecated
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/**
  - test/**
  - docs/**
---

# Smaller places where the repository departs from its documented conventions (deprecated)

## Context and problem statement

Records 0007 to 0021 state conventions. Measuring them on `main` (75c58f4c, 2026-10-24) found smaller departures that are not worth a record each but should not be lost. None is scheduled. The larger deviations have their own records (0023 to 0028).

## Decision

The departures below are deprecated: not copied into new code, and fixing one is welcome in any pull request that touches the file.

### Evidence

| # | Departure | Rule | Evidence | Remediation | Size |
| - | - | - | - | - | - |
| 1 | The interactive layer imports an ops module and the command framework | 0005: `src/utils/interactive/` never imports `src/ops/` except `JourneyDebugPrompt` | `RealmPickers.ts` line 107 dynamically imports `ops/RealmOps`; `EntityPickers.ts` and `RealmPickers.ts` import `cli/ResolveInteractiveInputs` dynamically (4 sites) | Inject the realm loader like the entity loaders; document or remove the framework imports | S |
| 2 | Misspelled or inconsistent file names | 0023 | `FrConfigRestartOps.ts.ts`, `FrConfigIdmAuthenticationOpts.ts` | Rename | S |
| 3 | Four tests switched off by a trailing underscore | 0011 | `src/ops/Saml2Ops.test_.ts`, `test/unit/Config.test_.ts`, `test/client_cli/en/app-describe.test_.js`, `oauth-client-describe.test_.js` | Repair or delete | S |
| 4 | Two config-manager commands may pass the wrong constructor argument | 0008 | A comment in `src/app.commandWiring.test.ts` flags `config-manager-pull-oauth2-agents.ts` and `config-manager-pull-variables.ts` ("worth a second look") | Check and fix | S |
| 5 | The e2e README says the tests are "e2e-only by deliberate choice" | 0011 | the repository has e2e (263 files), `-h` snapshots (364) and unit tests (56, 14 of them PTY) | Reword the README line | S |
| 6 | `docs/BUILD-ENV.md` section 1 says ESLint 8/9 with a migration planned | section 5 says ESLint 10 since 2026-10 | same file | Update the map | S |
| 7 | `docs/PIPELINE.md` says the Build job runs on Node 24 as "the npm support floor" | 0013: Node 26 only, `engines.node >= 26` | same file | Reconcile the wording | S |
| 8 | `docs/CONTRIBUTE.md` CRUDQ table for ops function names | 0009: ops functions use the command verbs | 296 of 528 exported ops functions use `import`, `export`, `list`, `describe` | Add the verb rule to the table | S |
| 9 | Two e2e tests do not exercise what their title says | the e2e README's own "Known gaps" | `secretstore-mapping-delete` runs `create`; the ForgeOps variant of `config-manager-push-raw` pushes nothing | Fix the tests | S |
| 10 | Comments refer to private notes and to a past incident | durable design goes into repository docs | `src/app.commandWiring.test.ts` (a note by name), `src/utils/interactive/EntityPickers.ts` (a reference to a past incident) | Reword | S |
| 11 | A utility file imports the layer above it | 0007 | `utils/Config.ts` imports eight ops modules (record 0027) | See 0027 | S |
| 12 | Usage examples: 55 of 339 commands | 0006 | the ratchet list holds the rest (282 when 0006 was written) | Incremental; each fix shrinks the list | M |

## Consequences

- None of these breaks users today.
- A reviewer may point at this record when a pull request copies one of the patterns.
