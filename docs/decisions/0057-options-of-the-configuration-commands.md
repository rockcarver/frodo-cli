---
status: accepted
date: 2026-11-17
decision-makers: maintainers
applies-to:
  - src/cli/config-manager/**
  - src/cli/config/**
  - src/cli/iga/workflow/iga-workflow-delete.ts
  - src/cli/service/service-import.ts
issues:
  - rockcarver/frodo-cli#1264
---

# Options of the configuration commands

## Context and problem statement

The options of the `pull`, `push`, `delete`, `migrate` and `promote` commands of the configuration group ([0056](0056-the-configuration-command-group.md)) grew without a rule. On 2026-11-17 one short letter often meant several different things inside the group. `-f, --file` named a file the user writes, while everywhere else in frodo it is the file the data is read from or written to. `-n, --name` mostly carried an identifier. Dependencies of journeys were opt-in, where the export and import commands use `--no-deps`. The people who run the commands asked to keep their short forms, and the maintainers agreed where a letter cannot mislead. Heritage commands here are the commands that are not one of those five verbs of the group, `config export|import` among them.

## Decision

- **Config file.** `--config-file`, long-only, never `-f`, is the one name of a file the user writes to say what to pull and how to override it. The old spellings `-f, --file`, `-f, --config-file` and the long `--file` are removed at once from the commands that take one, with a `MIGRATION.md` entry and no alias, not even a hidden one. `-f` is unused in the group; `-f, --file` stays reserved for data files.
- **Optional unless it cannot be guessed.** On `pull saml`, `pull authz-policies` and the commands for the agent types the file is optional: without it the command pulls everything it covers, narrowed by the selectors below, and a given file selects and overrides as before. `pull service-objects` and `pull raw` keep a required file, because queries and paths cannot be guessed ([0041](0041-the-config-manager-plain-form-is-what-an-unattended-pipeline-needs.md)). Types that only take overrides work without one. No config folder option is added to these commands.
- **`pull all` pulls everything for these types when their conventional file is absent.** For saml, authz-policies and the agent types it does not skip the step with a warning, as 0041 says of a conventional input file; it pulls everything the type covers, as the standalone command does. This changes that part of the rule of 0041 for these types only, and says so here so that it is not silent. The rest of how `pull all` finds its files stays as 0041 says, and a file that exists but cannot be read or parsed still fails.
- **One meaning per letter inside the group,** kept by a unit test. A heritage command may use the same letter for something else when the concepts differ, when a value is set against a flag so that a mix-up fails loudly, or when a mix-up is harmless (a read-only pull, a dry run). It may not when a destructive option would share the letter with a harmless one.
- **An option that makes a command destructive has a long form only** (for example `--clean`).
- **Letters.** `-I` is `--ignore-encrypted-secrets`, `-L` is `--local-lock-only` and `-P` is `--promoter`. These are long-only: `--check`, `--clean`, `--description`, `--draft`, `--filename-filter` (in either spelling), `--include-immutable`, `--stdin`, `--custom-relationships`, `--dump`, `--provisional`, `--path`, `--provisional-rollback`. The other short forms stay on one option each: `-a` active only, `-C` config folder, `-c` category, `-d` dry run, `-i` id, `-l` list, `-M` metadata, `-n` name, `-p` prefix, `-r` report, `-s` status, `-T` timeout, `-t` ticket reference, `-u` unlock after, `-w` wait, `-y` yes.
- **`-d, --dry-run` on every command that has a dry run,** including `push secrets` and the delete commands that spelled it long-only.
- **Three heritage definitions give up their letter** so that `-d` and `-C` stay safe in the group: `iga workflow delete -d, --draft-only`, `config import -C, --clean` and `service import -C, --clean` become long-only, and their long forms keep working. Nothing else in a heritage command changes because of this record.
- **Selectors.** `-i, --<type>-id` selects by an identifier, a value that cannot be chosen or cannot be changed later (a journey name is one). `-n, --<type>-name` selects by a name that can be chosen freely and changed later. An object with both takes both, declared as mutually exclusive ([0032](0032-mutually-exclusive-options-are-declared-and-never-contradict-a-requirement.md)), as `frodo script export` does. A type with a fixed set of ids uses the id option. `-n, --name` stays as a documented permanent alias on every command that has it. The pickers come from the framework ([0038](0038-an-entity-named-by-i-or-n-gets-its-picker-from-the-framework.md)).
- **Dependencies.** `pull journeys` and `push journeys` include them by default (on pull the inner journeys, on push the inner journeys and the scripts) and take `--no-deps` to leave them out, as the heritage commands do. `--pull-dependencies` and `--push-dependencies` go.

## Consequences

- Changes to heritage definitions and to the group's options go into `MIGRATION.md` ([0048](0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md)).
- The removed spellings of the config file option and the change to `pull all` have an entry each. A script that passes `-f` or `--file` to one of these commands fails and must change.
- A user of `pull all` without a config file for saml, authz-policies or the agent types gets every object of those types, where 0041 gave a warning and nothing, so the output of `pull all` grows.
- A push of a journey fails and names the dependency when its files are missing from the folder; `--no-deps` pushes the journey alone.
- Kept in sync: the one-meaning-per-letter test, the help snapshots, the usage examples, and the e2e tests, which pin their recording name so that a changed flag does not orphan a recording.
- Not covered: command names ([0056](0056-the-configuration-command-group.md)) and confirmation ([0058](0058-confirmation-and-the-experimental-label.md)).

## Alternatives considered

- **Remove most short forms:** most overlaps cannot mislead, and the people who run the commands asked to keep them.
- **One scheme for all of frodo:** the heritage commands keep their names, options and selectors.
- **Read the config file from the config folder when it is absent:** it needs a config folder option the standalone commands do not have.
- **Keep the old spelling as a hidden alias:** scripts keep running, but two names stay for one option and the removal is only postponed; the group is experimental ([core 0019](core/0019-experimental-features-are-not-bound-by-compatibility-records.md)), so the break is taken at once.
- **Keep `pull all` skipping an absent file for these types:** nothing changes for its users, but the same missing file then gives a skip in `pull all` and a full pull in the standalone command.
