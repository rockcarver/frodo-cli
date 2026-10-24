---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/ops/**
---

# Ops functions that implement a command are named after its verb; other functions follow CRUDQ

## Context and problem statement

`docs/CONTRIBUTE.md` ("Managing objects - CRUDQ") tells contributors to name functions that manipulate objects `create`, `read`, `update`, `delete`, `query`, `get` and `set` for single properties, and `enable` and `disable` for status. The table is a copy of the library's (frodo-lib record 0006) without its `export` and `import` rows. In the CLI's ops layer the functions that implement a command have a different, stable vocabulary: the verb of the command. This record states the pattern that the code shows and the documents do not. Recorded retroactively and measured on `main` (02a74335, 2026-10-24) over the 528 exported functions in `src/ops/`.

## Decision

- An ops function that implements a command is named `<verb><Thing>[Suffix]` with the verb of the command: `listJourneys`, `describeJourney`, `exportJourneyToFile`, `importJourneysFromFiles`, `deleteJourney`. It prints, saves or reads files, and returns whether it succeeded (the command sets the exit code).
- Any other ops function follows the CRUDQ convention of the library (`createX`, `readX`, `updateX`, `deleteX`, `queryX`; `getX` and `setX` for one property; `enableX` and `disableX` for status), or has a meaningful name.

## Consequences

Measured:

| Group | Functions | Share |
| - | - | - |
| command verbs (`import` 120, `export` 101, `list` 46, `describe` 29) | 296 | 56.1% |
| documented CRUDQ words (`delete` 59, `get` 51, `create` 14, `read` 6, `set` 5, `update` 4, `enable` 1, `disable` 1) | 141 | 26.7% |
| everything else (`build` 10, `extract` 7, `resolve` 6, `write` 5, `add` 3, `remove` 3, `validate` 3, `is` 3, `verify` 3 and 40 more words) | 91 | 17.2% |

- `delete` is both a command verb and a CRUDQ word, so its 59 functions satisfy both readings.
- `read` (6), `update` (4) and `query` (0) are rare because the library does that work. This is the thin-wrapper rule (0007) visible in the names.
- The 93 exported functions in `src/configManagerOps/` are named `configManager<Verb><Entity>` (`configManagerExportSaml`), a scheme of its own that matches neither vocabulary. It is part of the config-manager deviation (record 0023).
- The documentation does not say any of this. `docs/CONTRIBUTE.md` and `.github/instructions/cli-commands.instructions.md` should add the command-verb rule and drop the pretence that CRUDQ governs the ops layer; that is a small documentation change, listed in the backlog.
