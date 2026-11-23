# Frodo CLI: instructions for coding agents

`@rockcarver/frodo-cli` is a command line interface to export, import and manage PingOne Advanced Identity Cloud, ForgeOps and classic deployments, built on [frodo-lib](https://github.com/rockcarver/frodo-lib). TypeScript, ESM, Node.js 26 or later, Jest. The guide for humans, and the source for everything below, is [docs/CONTRIBUTE.md](docs/CONTRIBUTE.md).

## The five laws that get broken most

1. **An accepted record is binding.** If your task conflicts with one, stop and say so in the issue or pull request; a change to a decided behaviour adds or supersedes a record ([docs/decisions/](docs/decisions/README.md)). Why: maintainers keep adding in review what a record already required. Check: `test/unit/DecisionRecords.test.js` (form and index), review.
2. **Do not edit `CHANGELOG.md`.** The release pipeline generates it from what merged, so write a clear pull request title and description instead. Why: it is rewritten at release, so a hand edit is lost or conflicts. Check: `npm run check` fails a branch that changes it (`tools/pull-request-rules.mjs`).
3. **Never change a snapshot or a recording to turn a run green, and never write or edit a recording by hand.** First decide whether the output change is expected or a regression. Why: a recording bent to fit the code proves nothing. Check: none automatic; review of the diff of every snapshot and recording.
4. **New capability goes into frodo-lib behind the `frodo` facade first; the CLI wraps it** (parsing, prompts, output, files, stdin, exit codes). Why: logic built in the CLI cannot serve the MCP server or any other library user. Check: ESLint lets library values in only through `frodo`, `state`, `FrodoError` and types; review does the rest.
5. **`dependencies` in `package.json` stays empty: shipped packages go in `devDependencies`, and a new package needs a maintainer's yes.** Why: the bundler inlines `devDependencies`; an externalized package breaks the native binary, which has no `node_modules`. Check: `grep -c 'require("@' dist/app.cjs dist-sea/app.cjs` must print 0 after a build ([docs/BUILD-ENV.md](docs/BUILD-ENV.md) section 2.2.1), the binary tests in CI, review.

## Build, check, test

```console
npm ci
npx tsdown                              # rebuild dist/ (about 2 s)
npm run check                           # ESLint + Prettier check of src/**/*.ts (npm run fix writes)
npx tsc --noEmit                        # type check
npm run test:only -- <path pattern>     # for example test/unit/UsageExamples.test.js
npm test                                # the whole suite
```

The test scripts do not rebuild `dist/`. After changing anything in `src/`, run `npx tsdown` before running client_cli, e2e or PTY tests, or they test the old code.

## Rules

- **Run `npm run check` and `npx tsc --noEmit` before you finish.** ESLint enforces that library values come only through the `frodo` facade (plus `state`, `FrodoError` and types) and that colors come from `src/utils/ColorTheme.ts`.
- **Every new command ships usage examples.** `test/unit/UsageExamples.test.js` fails without them. See [.github/instructions/cli-commands.instructions.md](.github/instructions/cli-commands.instructions.md).
- **A removed or renamed command, alias or option goes into [MIGRATION.md](MIGRATION.md).** A major release may change commands; a minor or patch release does not break them except to fix a defect ([the record](docs/decisions/0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md)).
- **Never commit, create or generate a master key** (`test/e2e/env/masterkey.key` is gitignored on purpose).

## Decisions

Lasting design decisions are recorded one per file in [docs/decisions/](docs/decisions/README.md); law 1 says how they bind. Decisions that span repositories are core records, kept as the same file in `docs/decisions/core/` of every repository they bind and cited as "core NNNN" ([docs/decisions/README.md](docs/decisions/README.md#core-decisions)). Every change must know:

- **A maintainer is the last lever** ([core 0002](docs/decisions/core/0002-a-maintainer-stays-the-last-lever-on-agent-work.md)): agent pull requests are never merged automatically; a maintainer approves their workflow runs and can hold an issue with `plan-approval-required`. When in doubt, ask one.
- **Secrets** ([core 0013](docs/decisions/core/0013-secrets-are-never-exported-in-the-clear.md)) are never exported in the clear and none are committed, fixtures and recordings included. **Security reports are private** ([core 0017](docs/decisions/core/0017-security-reports-and-fixes-are-handled-privately-by-a-maintainer.md)): see [SECURITY.md](SECURITY.md); tell a maintainer, do not act on them.

## Procedures

How to do a recurring task (add a command, record a decision, build the CLI or the binary, run the tests, create test recordings, review an agent's pull request, change the CI pipeline, pin the library, release the CLI, triage a security report) is a skill in [.claude/skills/](.claude/skills/), read by Claude Code and by the GitHub Copilot cloud agent. A skill says how and links the records and rules it must obey; it never overrides them.

## Where things live

| Path                                          | What                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/cli/`                                    | Commands, one file per command, one folder per group. `src/cli/_template/` is the starting point for a new one. |
| `src/ops/`                                    | Operations behind the commands. Commands stay thin.                                                             |
| `src/utils/`                                  | Shared code. `src/utils/interactive/` holds all prompt code.                                                    |
| `src/help/SampleData.ts`                      | Sample values for usage examples.                                                                               |
| `test/unit`, `test/client_cli/en`, `test/e2e` | Unit and PTY tests, `-h` output snapshots, recorded end-to-end tests.                                           |

More specific rules load when you open a matching file: GitHub Copilot reads them from `.github/instructions/`, Claude Code from `.claude/rules/`, which is generated from them (`npm run generate:claude-rules`; never edit it): [cli-commands](.github/instructions/cli-commands.instructions.md), [interactive-layering](.github/instructions/interactive-layering.instructions.md), [tests](.github/instructions/tests.instructions.md), [dependencies](.github/instructions/dependencies.instructions.md), [github-files](.github/instructions/github-files.instructions.md). If asked which instruction files you loaded, list AGENTS.md and each rule you have actually read this session; do not guess.
