---
status: superseded by 0052
date: 2026-11-14
decision-makers: maintainers
applies-to:
  - src/cli/feature/**
  - src/ops/FeatureRepairOps.ts
  - src/ops/FeatureBackup.ts
issues:
  - rockcarver/frodo-cli#1300
---

# A repair writes a backup first, changes only what it needs and never restores data by itself

## Context and problem statement

`frodo feature validate --repair` writes configuration to a tenant that is in a state the product did not intend. When this was decided, on 2026-11-12, a feature could read as not installed although every definition of it was there, because a customer had changed a title or a trailing newline, and running the platform's enable action in that state would have added the definitions a second time. A repair therefore has to touch configuration that holds the customer's own choices, and the CLI has no way to undo what it wrote: the way back is a copy of what was there.

## Decision

- **A backup comes first.** Before its first write to the tenant a repair writes the raw configuration it would overwrite or delete to a directory the user names with `--backup-dir`. The option is required: on a terminal the command asks for the directory, and without a terminal it refuses before it logs in. `-y, --yes` skips the confirmation and never the backup.
- **The backup is protected.** Its files are readable by the owner only, and an existing file is never overwritten. It is written after the user agreed and before the library starts to repair, so a plan that is refused, declined or has nothing to do leaves nothing on the disk.
- **One confirmation, itemised.** The plan is shown step by step, with the value before and after for every definition it changes, and the user is asked once. Without a terminal and without `--yes` the command refuses (record 0037).
- **Only as far as the repair needs.** A customised definition is aligned with the original only when a step needs it, and is put back as the user had it at the end of the repair, unless the user asked for `--keep-aligned`.
- **Data is never restored by itself.** What exists in one place and is missing in another, for example objects that IDM holds and AM does not list, is reported with what to do about it. A repair does not create, import or delete such objects.
- **A failed step ends the run.** The command exits with 1 and names the step and the backup.

## Consequences

- A repair of another feature follows the same rules, and relaxing one of them needs a new record.
- Kept in sync: `test/unit/FeatureRepairOps.test.js` (the order, the refusals, the exit codes), `test/unit/FeatureBackup.test.js` (permissions, no overwrite) and `test/unit/FeatureValidateFakeAm.test.js` (a repair that cannot run writes nothing), and the usage examples of `frodo feature validate`.
- The alignment, the restore and the read-back of every write are the library's; the CLI shows the plan, takes the backup, passes `--keep-aligned` and reports each step.
- Not decided: pruning old backups. The user owns the directory.

## Alternatives considered

- Taking the backup before the confirmation: rejected, a declined repair would leave raw configuration on the disk for nothing.
- Making `--yes` skip the backup directory too: rejected, the backup is the only way back and a script can pass the directory.
