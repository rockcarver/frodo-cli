---
status: accepted
date: 2026-11-17
decision-makers: maintainers
applies-to:
  - src/cli/config/**
  - src/cli/config-manager/**
  - src/cli/dcc/**
  - src/app.ts
issues:
  - rockcarver/frodo-cli#1264
---

# The configuration command group

## Context and problem statement

Moving configuration in and out of a tenant had several entry points. The `config-manager` group writes a tenant as a folder of small files, one per object, so that a diff shows what changed. `config export|import` do a similar job, with their own users, and are documented apart. The root `promote` compares two local folders and never calls the platform promotion, yet shares its name. Direct control exists twice, as `dcc session` and as `config-manager push direct-control-*`. The `test` commands copy `frodo conn test`. Some objects carry names that differ from the rest of frodo. The group is experimental, and once the label is off only a major release may rename a command ([0048](0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md)), so the shape is settled first. [Record 0022](0022-config-manager-commands-move-to-the-root.md) proposed root `pull|push|delete` verbs and was never accepted. Decided on 2026-11-17, after the proposals of rockcarver/frodo-cli#1264 were discussed.

## Decision

- **One group, `frodo config`.** It hosts `pull`, `push`, `delete`, `migrate` and `promote` beside `export` and `import`. `config-manager` stays as a transition alias of the merged group, added with `withAlias(name, 'transition')` ([0049](0049-an-alias-is-named-in-the-description-and-the-old-name-of-a-renamed-command-stays-as-a-transition-alias.md)). As a side effect `config-manager export|import` resolve too, and the help and `MIGRATION.md` say so.
- **The experimental label sits on the leaves, not on the group.** A command takes the strongest label found among its ancestors, so a label on the merged group would also mark `config export|import`, which are stable. [Core 0019](core/0019-experimental-features-are-not-bound-by-compatibility-records.md) binds only the commands that say they are experimental.
- **`config export|import` stay, and so does every other export and import command of the supported types.** They have their own users, so nothing about them is deprecated or removed. The merged group holds both ways of moving configuration: the JSON export and import, and the file-per-object pull, push and delete.
- **The root `promote` is retired.** It stays deprecated and frozen with a notice that names its replacements, and a major release removes it. `config promote` is the platform promotion.
- **`frodo dcc session` is the one implementation of direct control** and stays at the root. The four `push direct-control-*` commands are removed with a `MIGRATION.md` entry, and `dcc session` gains what they had that it lacks, such as waiting for completion.
- **No `test` commands.** `pull test`, `push test` and `delete test` are removed; `frodo conn test` tests a connection for every group.
- **Names are shorter and follow the rest of frodo.** `applications` is `apps`, `authentication` is `authn`, `custom-nodes` is `nodes`, `connector-definitions` is `connectors` and `secret-mappings` is `secretstore-mappings`, in every verb that has them. Each old name stays as a transition alias. Other types keep their names.
- **The agent types split.** `oauth2-agents` becomes `oauth-clients` (OAuth2 clients) and `agents` (the agent types that have no command of their own: the supertype skips a subtype that has an owner, [core 0022](core/0022-a-configuration-type-has-one-owner-in-every-layer.md)). The old word stays as a deprecated command that runs both, so pipelines and `pull all` keep working. AI agents get a type of their own, `aiagents`, with `pull`, `push` and `delete`, once a spike shows that the library supports it. This lifts the exclusion of AI agents in [0054](0054-a-config-manager-object-has-one-writer-and-agent-files-are-written-in-the-plain-shape.md).
- **Transition aliases follow 0049:** the old name is named in the help, prints one notice, and a major release removes it.

## Consequences

- Records that say `config-manager` ([0041](0041-the-config-manager-plain-form-is-what-an-unattended-pipeline-needs.md), 0042, 0054 and the core records) mean this group under its old name. The pull and push verbs are those of the library functions of [core 0024](core/0024-the-library-turns-configuration-into-file-sets-and-back-and-never-touches-the-file-system.md).
- Every removal and rename goes into `MIGRATION.md`. The e2e tests of the group pin their recording name, so a rename does not orphan a recording, and existing tests keep their old spellings through the aliases.
- Kept in sync: the README command table, the help snapshots, the usage examples ([0002](0002-usage-examples-run-as-written-and-open-no-prompt.md)), and the status line of 0022 (`superseded by 0056`) with both index rows.
- Not covered: options and selectors (0057), confirmation and the label (0058), the stability label of `dcc`, and when a transition alias is removed.

## Alternatives considered

- **Keep `config-manager` as the one name:** no move, and the name its users know, but it is longer to type and carries the name of the tool the layout came from.
- **Root verbs `frodo pull|push|delete` (record 0022):** the shortest names, but they split the family, clash with the root `promote` and move every test.
- **Two families as before:** no work and nothing lost, but two ways to do one job, documented twice.
