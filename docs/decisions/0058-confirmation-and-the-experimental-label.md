---
status: accepted
date: 2026-11-17
decision-makers: maintainers
applies-to:
  - src/cli/config-manager/**
  - src/utils/BulkDeleteGuard.ts
issues:
  - rockcarver/frodo-cli#1264
---

# Confirmation and the experimental label

## Context and problem statement

Some commands of the configuration group ([0056](0056-the-configuration-command-group.md)) restart the environment or lock it for minutes: `push restart`, `promote run-promotion` and `promote rollback`. `promote run-dryrun-promotion` changes nothing but runs for minutes as well. On 2026-11-17 none of them asked before it started. [Record 0037](0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md) guards bulk deletes, and its shared helper in `src/utils/BulkDeleteGuard.ts` also has a question for an action that does not delete.

The group is experimental. [Core 0019](core/0019-experimental-features-are-not-bound-by-compatibility-records.md) says that removing the label is a decision that names the release, but nothing said what must be true first. After the label is off only a major release may rename a command ([0048](0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md)), so names and options come first.

## Decision

- **These commands ask first:** `promote run-promotion`, `promote rollback` and `promote run-dryrun-promotion`, whose help says why a command that changes nothing asks. `push restart` asks wherever it would restart, and a restart never happens unasked.
- **`push restart` by option.** `-s` (a status read) never asks. Without `-s` and `-c` it restarts, so it asks first like the others. `-c` (restart only if ESVs need loading) runs the check without a question and asks only if the check finds ESVs to load and would restart.
- **One implementation.** The question and the refusal come from the shared helper of 0037, not from a prompt of the command.
- **With a terminal** the command says what it is about to do and where, and asks; the default answer is no. `-y, --yes` answers it.
- **Without a terminal and without `-y, --yes`** the command is refused before the login with an error that names `-y, --yes`, and exits with a failure code ([0033](0033-code-sets-the-exit-code-and-returns-instead-of-exiting.md)), as the bulk-delete guard does. `push restart -c` cannot know before its check whether it would restart, so it is refused at that point, before restarting.
- **An exception to the plain form of [0041](0041-the-config-manager-plain-form-is-what-an-unattended-pipeline-needs.md),** as 0037 is: a pipeline adds `-y, --yes` once.
- **The label comes off the leaves of the group together,** by one decision that names the release (core 0019), and only when all of this is true:
  1. the options and names of [0056](0056-the-configuration-command-group.md) and [0057](0057-options-of-the-configuration-commands.md) are in place;
  2. `push all-static` exists, one command that pushes all static configuration;
  3. every command works in its plain form in an unattended pipeline, and the commands that 0041 lists as not yet doing so (rockcarver/frodo-cli#1112) are brought under it;
  4. every type that has a pull and a push has a delete, or a recorded reason why not;
  5. the recordings and live checks of `pull all` and `promote` are made again against a tenant;
  6. whether `-w, --wait` stays opt-in (a long operation returns at once unless it is given) is decided again.
- From the release that drops the label the commands are bound like any other.

## Consequences

- A pipeline that runs `push restart` (not `-s`), `promote run-promotion` or `promote rollback` adds `-y, --yes` once. A pipeline that runs `push restart -c` adds it too: without it the run succeeds while nothing needs loading and is refused, before restarting, on the first run that would restart. `MIGRATION.md` says so; the group is experimental, so the entry is welcome, not required.
- Usage examples of these commands carry `--yes`, except those of `push restart -s`, and their e2e tests pass `-y` likewise ([0002](0002-usage-examples-run-as-written-and-open-no-prompt.md)).
- Kept in sync: the inventory of confirmations in `test/unit/PromptsAreFramed.test.js`, the help text and the help snapshots of the four commands.
- Not decided: the release that drops the label, and whether a command waits by default.

## Alternatives considered

- **Wait by default:** it would change pipelines that return at once, so it is decided again when the label comes off.
- **No question for `promote run-dryrun-promotion`:** it changes nothing, but it runs for minutes like a promotion.
- **Remove the label first and fix names later:** a rename would then wait for a major release.
- **Let `push restart -c` restart without a question:** the restart would happen unasked, which this record rules out.
- **Ask or refuse before the check of `push restart -c`:** a pipeline with nothing to load would fail or wait for an answer for no reason.
