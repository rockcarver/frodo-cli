---
status: accepted
date: 2026-11-07
decision-makers: maintainers
applies-to:
  - src/utils/interactive/EntityPickers.ts
  - src/cli/ResolveInteractiveInputs.ts
  - src/cli/**
---

# An entity named by -i or -n gets its picker from the framework

## Context and problem statement

Record 0017 has each command register its own entity picker (`deferEntityPicks` at setup, `resolveEntityPicks` in the action body). When this was decided, on 2026-11-07, 202 command files took an entity by `-i` or `-n` and 26 of them had a picker. The others fall back to a free-text prompt for the id, as the commands of a family that was added without one do. Whether a command gets a picker depends on its author remembering, and the same registration code is repeated in every command.

## Decision

- **The framework resolves the picker.** An option that names an existing entity, by id (`-i`, `--<kind>-id`) or by name (`-n`, `--<kind>-name`), and that is missing while the command requires it (mandatory, or in a one-of group), is resolved with a picker over the entities of that kind, after login, in the one pass of record 0015.
- **One registry.** A family of commands says once how to list its entities (the loader, the row label, the value, the deployment types) in one registry under `src/utils/interactive/`. Every command of the family that has the option inherits it. A command file does not declare a picker and does not call the resolver.
- **The free-text prompt is the fallback** only for a family with no registry entry, or for an option that is not an entity reference.
- **Kept from record 0017.** A declined (Escape) or failed pick never runs the command's body and exits with a failure code; a failed load prints its error; a single candidate is selected automatically; an empty list counts as satisfied. The framework, not the command, enforces this, so a delete cannot be reached through a pick that did not happen.
- **Record 0030 applies unchanged.** The picker opens only for input the command line lacks and 4.x would have rejected; a complete command line never opens it.
- **Connection profiles** (a host argument, `--target`) use the existing profile picker under the same rule.
- **A test keeps it honest.** A unit test walks every command and fails for an entity option without a registry entry. A list of legacy exceptions covers the commands that have none when this is decided; it only shrinks, and a new command is never added to it.

## Consequences

- A new family adds one registry entry and its commands get the picker; nothing in the command files changes.
- The commands that carry `deferEntityPicks` and `resolveEntityPicks` move to the registry in follow-up pull requests; until then they stay in the legacy list. The commands without a picker gain one family by family, as their loaders are registered.
- To keep in sync: the entity picker section of `docs/INTERACTIVE-COMMANDS.md`, the status line of record 0017 (`superseded by` this record) and both index rows, and the `Known deviations` of this record if the migration is not finished when it is accepted.
- Not decided: the order in which the existing families are migrated.

## Alternatives considered

- Keep per-command registration and add the failing test only: the repeated code stays, and the rule the maintainers want (the framework decides) is not met.
- Derive every loader from the family's `list` command: list commands print and do not return entities, so each would need the same read function anyway.
- Match any option named `-i` or `-n` at run time: an option with those letters is not always an entity (an input file, a count), so the registry and the test decide, not the letters.
