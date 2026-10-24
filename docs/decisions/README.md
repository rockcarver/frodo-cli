# Decision records

A decision record says what the maintainers decided about how this project works, and why, so that every contributor, human or tool, can find it in the repository instead of in someone's memory. Tools that read `AGENTS.md` are pointed here.

## What binds

- **An accepted record is binding** for everyone who changes this repository until a newer record supersedes it.
- **If your task conflicts with an accepted record, stop and say so** in the issue or pull request. Do not override it, and do not quietly work around it.
- **A pull request that changes a decided behaviour adds a new record or supersedes the old one,** in the same pull request.

## When to write one

Write a record for a decision that will outlive the change that prompted it: a rule contributors must follow, a behaviour users rely on, a design principle, a policy. Do not write one for a routine implementation note, a refactor or a bug fix. When in doubt, ask in the issue.

## Format

One file per decision, named `NNNN-short-title.md` (four digits, counted up from `0001`, never reused). Start from [template.md](template.md). Each record starts with front matter:

- `status`: `proposed`, `accepted`, `rejected`, `deprecated` or `superseded by NNNN`.
- `date`: the day the status last changed, `YYYY-MM-DD`.
- `decision-makers`: roles such as `maintainers`. Never private data.
- `applies-to`: a list of path globs the decision binds. Leave it out for a repository-wide decision.
- `issues`: optional list of issues and pull requests, written `owner/repo#number`.

The body has `Context and problem statement`, `Decision` and `Consequences`, and optionally `Alternatives considered`. Keep it short, in plain language, and neutral about tools. No secrets and no private information.

## Superseding

Accepted records are not edited, except to fix a typo. To change a decision, write a new record that says what it replaces, and set the old record's status to `superseded by NNNN`. `test/unit/DecisionRecords.test.js` checks the front matter, the numbering, the index below and the supersede links.

## Decisions that span repositories

A decision that binds more than this repository is recorded once, in the public umbrella repository [rockcarver/frodo](https://github.com/rockcarver/frodo) (`docs/decisions/`). Those that bind this repository are listed here:

- [0001 The library is the brain, the CLI is a thin wrapper](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0001-library-is-the-brain-cli-is-a-thin-wrapper.md). The link works once that record is merged in the umbrella repository.

## Index

| Number                                                                    | Title                                                | Status   | Applies to                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | -------- | --------------------------------------------------------- |
| [0001](0001-realm-picker-opens-only-when-the-command-is-incomplete.md)    | The realm picker opens only when the command is incomplete | accepted | `src/utils/interactive/RealmPickers.ts`, `src/cli/ResolveInteractiveInputs.ts`, `src/ops/AuthenticateOps.ts` |
| [0002](0002-usage-examples-run-as-written-and-open-no-prompt.md)          | Usage examples run as written and open no prompt     | accepted | `src/cli/**`                                              |
| [0003](0003-synchronous-stdin-reads-go-through-one-helper.md)             | Synchronous standard input reads go through one helper | accepted | `src/utils/StdinSync.ts`, `src/utils/Prompt.ts`, `src/configManagerOps/**` |
| [0004](0004-prompt-frames-follow-the-terminal-width.md)                   | Prompt frames follow the terminal width              | accepted | `src/utils/interactive/**`, `src/utils/TextLayout.ts`     |
| [0005](0005-interactive-layering.md)                                      | Interactive code has one home and one import direction | accepted | `src/utils/interactive/**`, `src/ops/**`, `src/cli/**`    |
| [0006](0006-every-new-command-ships-usage-examples.md)                    | Every new command ships usage examples              | accepted | `src/cli/**`                                              |
| [0007](0007-layers-and-the-thin-wrapper-in-the-cli.md) | The CLI has command files, an ops layer and utilities, and wraps the library thinly | accepted | `src/cli/**`, `src/ops/**`, `src/utils/**` |
| [0008](0008-every-command-is-a-thin-frodocommand-file-with-the-usual-verbs.md) | A command is a thin FrodoCommand file, in a group, with the usual verbs and options | accepted | `src/cli/**`, `src/app.ts` |
| [0009](0009-ops-functions-are-named-after-the-command-verb.md) | Ops functions that implement a command are named after its verb; other functions follow CRUDQ | accepted | `src/ops/**` |
| [0010](0010-output-goes-through-console-and-colours-through-colortheme.md) | The CLI prints through Console.ts and takes colours from ColorTheme.ts | accepted | `src/**/*.ts` |
| [0011](0011-tests-run-the-real-cli-against-recorded-traffic.md) | Tests run the real CLI against recorded traffic | accepted | `test/**`, `src/**/*.test.ts` |
| [0012](0012-the-library-is-pinned-to-an-exact-version.md) | frodo-cli pins frodo-lib to an exact version | accepted | `package.json` |
| [0013](0013-the-cli-ships-as-native-binaries-and-requires-node-26.md) | The CLI ships as native Node.js binaries and supports Node.js 26 only | accepted | `package.json`, `scripts/**`, `sea-config.json`, `tsdown.config.ts`, `tsdown.sea.config.mts` |
| [0014](0014-interactive-mode-is-ambient-and-gated.md) | Interactive mode is ambient, gated, and invisible outside the gate | accepted | `src/utils/interactive/PromptGateState.ts`, `src/cli/FrodoCommand.ts` |
| [0015](0015-missing-input-is-resolved-in-one-ordered-pass.md) | Missing input is resolved in one pass, in a fixed order, with a fixed precedence | accepted | `src/cli/ResolveInteractiveInputs.ts`, `src/utils/interactive/DefaultsStore.ts` |
| [0016](0016-option-requirements-are-declared-not-coded.md) | "At least one of" and "all together" are declared on the command, not coded in the action | accepted | `src/cli/**`, `src/cli/FrodoCommand.ts`, `src/app.commandWiring.test.ts` |
| [0017](0017-a-declined-or-failed-pick-never-runs-the-command.md) | A declined or failed entity pick never runs the command's body | accepted | `src/utils/interactive/EntityPickers.ts`, `src/cli/**/*-delete.ts` |
| [0018](0018-every-interactive-surface-speaks-one-key-language.md) | Every interactive surface speaks one key language | accepted | `src/utils/interactive/**` |
| [0019](0019-the-command-preview-shows-the-exact-command-to-retype.md) | The command preview shows exactly the command a user would retype | accepted | `src/utils/interactive/CommandPreview.ts` |
| [0020](0020-every-interactive-edit-has-a-non-interactive-equivalent.md) | Every interactive edit has a non-interactive equivalent, and containers and action stubs behave alike | accepted | `src/cli/conn/**`, `src/cli/settings/**`, `src/cli/FrodoCommand.ts` |
| [0021](0021-the-mcp-http-server-is-loopback-only-until-it-is-given-a-token.md) | The MCP HTTP server stays on loopback until it is given a token | accepted | `src/ops/McpServerOps.ts`, `src/cli/mcp/**` |
| [0022](0022-config-manager-commands-move-to-the-root.md) | The config-manager commands move to the root as pull, push and delete (proposed) | proposed | `src/cli/config-manager/**`, `src/app.ts` |
| [0023](0023-config-manager-has-its-own-layer-outside-ops.md) | The config-manager operations form a layer of their own outside src/ops (deprecated) | deprecated | `src/configManagerOps/**`, `src/cli/config-manager/**`, `src/utils/FrConfig.ts` |
| [0024](0024-config-manager-logic-lives-in-the-cli.md) | The config-manager logic lives in the CLI instead of the library (deprecated) | deprecated | `src/configManagerOps/**`, `src/cli/config-manager/**`, `src/utils/FrConfig.ts`, `src/utils/Config.ts` |
| [0025](0025-promote-compares-and-applies-configuration-in-the-cli.md) | Promote compares and applies configuration in the CLI (deprecated) | deprecated | `src/ops/PromoteOps.ts`, `src/cli/promote/**` |
| [0026](0026-admin-operations-are-implemented-in-the-cli.md) | The admin operations are implemented in the CLI while the library holds a commented-out copy (deprecated) | deprecated | `src/ops/AdminOps.ts`, `src/cli/admin/**` |
| [0027](0027-directory-layouts-and-where-used-search-live-in-cli-utils.md) | Directory layouts and the where-used search live in CLI utilities (proposed) | proposed | `src/utils/Config.ts`, `src/ops/ConfigOps.ts`, `src/ops/IdmOps.ts` |
| [0028](0028-log-event-analysis-lives-in-the-cli.md) | Log-event analysis lives in the CLI (proposed) | proposed | `src/ops/DebugLogOps.ts`, `src/ops/JourneyDebugAggregator.ts` |
| [0029](0029-smaller-inconsistencies-with-the-documented-conventions.md) | Smaller places where the repository departs from its documented conventions (deprecated) | deprecated | `src/**`, `test/**`, `docs/**` |
