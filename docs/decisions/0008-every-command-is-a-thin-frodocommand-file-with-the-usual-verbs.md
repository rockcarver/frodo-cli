---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/app.ts
---

# A command is a thin FrodoCommand file, in a group, with the usual verbs and options

## Context and problem statement

frodo-cli has 339 command files in 36 top-level command groups. Users learn one group and expect the next to behave the same; contributors copy a neighbour. The rules are in `docs/CONTRIBUTE.md` ("Writing a command") and `.github/instructions/cli-commands.instructions.md`. Usage examples have their own records (0002, 0006). Recorded retroactively and measured on `main` (02a74335, 2026-10-24).

## Decision

- Start from `src/cli/_template/`. One file per command, named `<group>-<verb>.ts`, in one folder per group. The group file registers its commands (`program.addCommand(XxxCmd().name('xxx'))`); a new group is imported and added in `src/app.ts`.
- A command is a `FrodoCommand('frodo <group> <verb>')` whose file exports `setup()` as default. The action calls `command.handleDefaultArgsAndOpts(...)`, logs in with `getTokens()`, calls an ops function and sets `process.exitCode = 1` when the operation fails. Logic lives in `src/ops/` (0007).
- One kind of configuration artifact is one group with the verbs `list`, `describe`, `export`, `import` and `delete`. Export commands share their options: `-i, --<thing>-id`, `-f, --file`, `-a, --all`, `-A, --all-separate`, `-N, --no-metadata`. A contributor copies a neighbouring command rather than inventing new spellings.
- Each command gets a `-h` snapshot test (`test/client_cli/en/<group>-<verb>.test.js`) and, if it talks to a tenant, an end-to-end test (record 0011).
- A removed or renamed command, alias or option is added to `MIGRATION.md`.

## Consequences

Measured over the 339 command files:

| Rule | Conformance |
| - | - |
| the action calls `handleDefaultArgsAndOpts` | 339 of 339 (100%) |
| the file calls `getTokens()` | 317 of 339 (93.5%); the 22 that do not are local commands (`conn`, `session`, `settings`), `log tail` and `mcp server tools` |
| the file sets `process.exitCode` | 327 of 339 (96.5%) |
| the last word of the command is one of the five usual verbs | 184 of 339 (54.3%); 24 of 58 groups and sub-groups have all five. The rest are config-manager pull and push per entity (record 0022), `create`, `set`, `update` and special verbs |
| export commands (35, excluding config-manager) have `-f, --file` | 35 (100%) |
| the same, `-a, --all` | 31 (88.6%); without: `authn export`, `idm schema property export`, `idm schema relationship export`, `saml metadata export` |
| the same, `-A, --all-separate` | 32 (91.4%); without: `authn export` and the two `idm schema` exports |
| the same, `-N, --no-metadata` | 32 (91.4%); without: the two `idm schema` exports and `saml metadata export` |
| the same, `-i, --<thing>-id` | 30 (85.7%); without: `authn export`, `config export`, `idm schema object export` and the two `idm schema` exports |
| usage examples (cli 0006) | 55 of 339 (16%) |
| a `-h` snapshot test with the command's name | 256 of 339 (75.5%); 83 without, of which 35 are config-manager commands |
| an end-to-end test file with the command's name | 208 of 339 (61.4%) |

- The test counts match file names only. A command whose tests are named differently counts as missing, and a command that does not talk to a tenant needs no end-to-end test.
- The export outliers are mostly commands that export one thing (a property, a relationship, metadata) where `-a` makes no sense. They are not recorded as deviations.
- The verb pattern is not enforced by a test; the usage-examples check is the only structural gate on command files, plus `app.commandWiring.test.ts`, which checks that the declared arguments agree with the action's parameters.
