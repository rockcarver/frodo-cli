---
status: proposed
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/cli/config-manager/**
  - src/app.ts
---

# The config-manager commands move to the root as pull, push and delete (proposed)

## Context and problem statement

`frodo config-manager pull`, `push` and `delete` are the commands that work with a directory of configuration in the fr-config-manager layout. They are marked experimental. Their names carry the name of the tool they started from, and they are meant to become the ordinary way to move configuration in and out of a tenant. This is the maintainers' plan, recorded here so that nobody builds against the old tree; it is not implemented. Checked on `main` (75c58f4c, 2026-10-24): there is no root-level `pull`, `push` or `delete` under `src/cli`, and `config-manager` is declared `experimental`.

## Decision

Proposed, not accepted:

- When the feature goes from experimental to stable, the commands become `frodo pull`, `frodo push` and `frodo delete`.
- The new root tree is registered through the existing leaf `setup()` factories, so no command logic is duplicated.
- The old `frodo config-manager ...` tree keeps working, is marked deprecated with a short, non-alarming pointer to the new names, and is removed in the next major release together with its tests.
- `dcc` stays a separate command.
- Two spelling differences are logged and not fixed here: `pull cookie-domains` against `push cookie-domain`, and `pull uiConfig` against `push ui-config`.

## Consequences

- Test fixtures move with the commands; recordings are re-labelled, not re-recorded.
- This record is independent of where the logic lives (record 0024): the flattening changes names, not code layout.
- Until it is accepted, new config-manager commands are added under `config-manager` as before, using the leaf factories.
