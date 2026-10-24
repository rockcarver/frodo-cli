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

- Placeholder: none recorded yet.

## Index

| Number                                                                    | Title                                                | Status   | Applies to                                                |
| ------------------------------------------------------------------------- | ---------------------------------------------------- | -------- | --------------------------------------------------------- |
| [0001](0001-realm-picker-opens-only-when-the-command-is-incomplete.md)    | The realm picker opens only when the command is incomplete | accepted | `src/utils/interactive/RealmPickers.ts`, `src/cli/ResolveInteractiveInputs.ts`, `src/ops/AuthenticateOps.ts` |
| [0002](0002-usage-examples-run-as-written-and-open-no-prompt.md)          | Usage examples run as written and open no prompt     | accepted | `src/cli/**`                                              |
| [0003](0003-synchronous-stdin-reads-go-through-one-helper.md)             | Synchronous standard input reads go through one helper | accepted | `src/utils/StdinSync.ts`, `src/utils/Prompt.ts`, `src/configManagerOps/**` |
| [0004](0004-prompt-frames-follow-the-terminal-width.md)                   | Prompt frames follow the terminal width              | accepted | `src/utils/interactive/**`, `src/utils/TextLayout.ts`     |
| [0005](0005-interactive-layering.md)                                      | Interactive code has one home and one import direction | accepted | `src/utils/interactive/**`, `src/ops/**`, `src/cli/**`    |
| [0006](0006-every-new-command-ships-usage-examples.md)                    | Every new command ships usage examples              | accepted | `src/cli/**`                                              |
