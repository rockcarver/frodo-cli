# Frodo CLI: instructions for coding agents

`@rockcarver/frodo-cli` is a command line interface to export, import and manage PingOne Advanced Identity Cloud, ForgeOps and classic deployments, built on [frodo-lib](https://github.com/rockcarver/frodo-lib). TypeScript, ESM, Node.js 26 or later, Jest. The guide for humans, and the source for everything below, is [docs/CONTRIBUTE.md](docs/CONTRIBUTE.md).

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
- **Packages imported by shipped code go in `devDependencies`; `dependencies` stays empty.** The reason and the check are in [docs/BUILD-ENV.md](docs/BUILD-ENV.md) section 2.2.1.
- **Do not edit `CHANGELOG.md`.** It is generated at release time from what merged since the last release (`Generate and promote AI changelog` in `.github/workflows/pipeline.yml`), so write a clear PR title and description. A removed or renamed command, alias or option goes into [MIGRATION.md](MIGRATION.md).
- **Do not update test snapshots to make a run green.** Decide first whether the output change is expected or a regression. See [.github/instructions/tests.instructions.md](.github/instructions/tests.instructions.md).
- **Never commit, create or generate a master key** (`test/e2e/env/masterkey.key` is gitignored on purpose).
- **Read standard input only through `src/utils/StdinSync.ts`.** A direct `readSync(0)` or `process.stdin.fd` fails with `EAGAIN` once anything has touched `process.stdin`; ESLint rejects it. See [.github/instructions/interactive-layering.instructions.md](.github/instructions/interactive-layering.instructions.md).
- **Do not run Prettier over `test/e2e/`.**
- **Do not edit the Repo Concierge's files**: `.github/workflows/*.lock.yml` and the `.md` workflow sources beside them, `janitor.yml`, `check-deployment.yml`, `concierge-updater.yml`, `dependency-watch.yml`, `plan-approval-resume.yml`, `pr-ready-signal.yml`, `.github/scripts/`, `.github/aw/` and the pin in `.github/concierge.yml`. An updater overwrites them. `pipeline.yml`, `dependabot*.yml`, `.github/agentic-workflows/scope.md` and `related-repos.md` belong to this repository.

## Decisions

Lasting design decisions are recorded one per file in [docs/decisions/](docs/decisions/README.md). **An accepted record is binding** for humans and agents until a newer record supersedes it.

- **If your task conflicts with an accepted record, stop and say so** in the issue or pull request. Do not override it.
- **A pull request that changes a decided behaviour adds or supersedes a record.**
- **New capability goes into frodo-lib behind the `frodo` facade first; the CLI wraps it for the terminal** (parsing, prompts, output, files and stdin, exit codes). The library stays free of anything tied to one interface, such as a terminal; interface-specific stacks (interactive mode, the MCP server, the frodo shell) legitimately live in the CLI.
- Decisions that span repositories live once in the public umbrella repository [rockcarver/frodo](https://github.com/rockcarver/frodo) (`docs/decisions/`). The gates read this repository only, so each one that binds it is stated in one sentence in [docs/decisions/README.md](docs/decisions/README.md#decisions-that-span-repositories). Every change must know:
  - **A maintainer is the last lever** ([0002](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0002-a-maintainer-stays-the-last-lever-on-agent-work.md)): agent pull requests are never merged automatically; a maintainer approves their workflow runs and can hold an issue with `plan-approval-required`.
  - **Required checks stay stable** ([0012](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0012-merging-is-gated-by-a-stable-set-of-required-checks.md), [0016](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0016-changes-that-are-not-code-still-run-the-checks-that-validate-them.md)): never rename `Build`, `Test gate` or the platform check; guidance changes still run `npm run test:guidance`.
  - **Secrets** ([0013](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0013-secrets-are-never-exported-in-the-clear.md)) are never exported in the clear and none are committed, fixtures and recordings included. **Security reports are private** ([0017](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0017-security-reports-and-fixes-are-handled-privately-by-a-maintainer.md)): see [SECURITY.md](SECURITY.md); tell a maintainer, do not act on them.
  - [0009 Let the callback handler return a promise](https://github.com/rockcarver/frodo/blob/main/docs/decisions/0009-let-the-callback-handler-return-a-promise.md) is proposed, not yet binding.

## Procedures

How to do a recurring task (add a command, record a decision, build the CLI or the binary, create test recordings, review an agent's pull request, change the CI pipeline, triage a security report) is a skill in [.claude/skills/](.claude/skills/), read by Claude Code and by the GitHub Copilot cloud agent. A skill says how and links the records and rules it must obey; it never overrides them.

## Where things live

| Path                                          | What                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/cli/`                                    | Commands, one file per command, one folder per group. `src/cli/_template/` is the starting point for a new one. |
| `src/ops/`                                    | Operations behind the commands. Commands stay thin.                                                             |
| `src/utils/`                                  | Shared code. `src/utils/interactive/` holds all prompt code.                                                    |
| `src/help/SampleData.ts`                      | Sample values for usage examples.                                                                               |
| `test/unit`, `test/client_cli/en`, `test/e2e` | Unit and PTY tests, `-h` output snapshots, recorded end-to-end tests.                                           |

More specific rules load automatically from `.github/instructions/` when you edit matching files: [cli-commands](.github/instructions/cli-commands.instructions.md), [interactive-layering](.github/instructions/interactive-layering.instructions.md), [tests](.github/instructions/tests.instructions.md), [dependencies](.github/instructions/dependencies.instructions.md).
