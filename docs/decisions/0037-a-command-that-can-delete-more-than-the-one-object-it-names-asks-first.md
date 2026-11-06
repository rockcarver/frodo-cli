---
status: proposed
date: 2026-11-06
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/ops/**
---

# A command that can delete more than the one object it names asks first

## Context and problem statement

Delete commands take a name (`-i`, `-n`), a filter (`-p`) or `--all`, and some new ones delete everything of a kind when they are given nothing. When this was decided, on 2026-11-06, almost none of them asked before deleting, so a mistyped or pasted command could remove every journey, script or secret of a tenant, and the few that did ask each had their own prompt.

Record 0030 keeps a command line that worked under 4.x working and quiet. Its purpose is that interactive mode does not start prompting for input in places that never prompted. A confirmation before a destructive bulk action is something else: a safety guard, and a major release is the moment to add it.

## Decision

- **When it applies.** A command that can delete, or otherwise destroy, more than one object in one run: `--all`, a filter such as a name prefix, or a form that deletes everything of a kind when nothing is named. A single named target never asks.
- **With a terminal** the command says what it is about to delete and where (the kind, the count and names when it can know them cheaply, the host and the realm) and asks. The default answer is no.
- **Without a terminal** it refuses, with an error that names `--yes` and `--dry-run`, and exits with a failure code. `-y, --yes` proceeds without asking. A refusal is never a silent skip.
- **Preview.** A command that can list what it would delete offers `--dry-run`, which never asks and never deletes.
- **One implementation.** The question, the refusal and their wording come from one shared helper. A command does not carry a prompt of its own, and one that does moves to the helper.
- **Exception to the first rule of record 0030.** A command line that deleted in bulk without a prompt under 4.x may ask under 5.x, or refuse when there is no terminal. Each such command is listed in `MIGRATION.md` with the flag a script adds. Nothing else changes: the same arguments delete the same objects.
- **Existing commands too.** A destructive command found without a reasonable guard is brought under this rule in the pull request that finds it.

## Consequences

- Scripts and CI jobs that delete in bulk add `--yes`. Usage examples never open a prompt (record 0002), so an example of a guarded form carries `--yes` or `--dry-run`, and an e2e test of one passes `--yes`.
- How a confirmation is drawn (record 0035) is not decided here. The shared helper is the one place that changes when it is.
- To keep in sync: the `MIGRATION.md` entry, the help snapshot and the usage examples of each guarded command, and the inventory of confirmations in `test/unit/PromptsAreFramed.test.js`.
- Not covered: which actions besides deleting count as destructive. A reviewer decides that per command.

## Alternatives considered

- Require `--all` where a bulk delete is a default: it renames the dangerous form and does not protect a pasted `--all`.
- Guard only the forms that delete everything, not filters: a short prefix can match a lot, and the plan the prompt shows is the protection.
- Leave existing commands alone, reading record 0030 literally: it keeps the commands where a mistake costs most unguarded.
- Edit record 0030: an accepted record is superseded, not edited. This record states the exception, as record 0032 does.
