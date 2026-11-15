---
status: proposed
date: 2026-11-15
decision-makers: maintainers
applies-to:
  - src/cli/feature/**
  - src/ops/FeatureRepairOps.ts
  - src/ops/FeatureBackup.ts
issues:
  - rockcarver/frodo-cli#1300
---

# A repair leaves the feature installed and puts customizations back only on request

## Context and problem statement

[Record 0051](0051-a-repair-writes-a-backup-first-changes-only-what-it-needs-and-never-restores-data-by-itself.md) decided that a repair puts every definition it had to align back as the user had it, unless the user passes `--keep-aligned`. A live repair on 2026-11-15 showed what that costs. The one thing wrong with the tenant was a trailing newline in a definition: it adds no configuration and no function, it only makes the registry's byte comparison read "not installed". The repair aligned it, ran the enable action, and then put the newline back, so a successful repair ended with the feature reading not installed. A changed display name of a definition is a different thing: a person chose it, and it is worth keeping. A repair has to tell the two apart.

## Decision

- **A repair repairs.** It leaves every definition it aligned aligned with the original, so that the registry reads the feature installed.
- **White space is noise.** A difference that is only white space is normalised and is never put back.
- **A customization is a change a person made on purpose**: a changed title of a definition, a property added to a mapping. The repair replaces it by default. The plan lists each one under its own heading with the value that goes and the original that takes its place, the confirmation question names them, and the summary says where the previous values are: in the backup.
- **`--restore-customizations` puts the customizations back** after the repair, and only them, never white space. The registry then reads "not installed" while they are in place, and the plan says so. The option replaces `--keep-aligned`, which was never released.
- **What record 0051 decided and this record does not change stays:** a backup first and protected, one itemised confirmation (none with `--yes`), data never restored by itself, a failed step ends the run.

## Consequences

- Supersedes the decision of record 0051 on putting definitions back; the rest of 0051 is repeated above, so that one record states the whole rule.
- With `--yes` a customization is replaced without a question; the backup is the way back.
- Kept in sync: `test/unit/FeatureRepairOps.test.js` (the plan, the question and the summary), `test/unit/FeatureDiagnosis.test.js`, the usage examples and the `-h` snapshot of `frodo feature validate`, and the entry in `MIGRATION.md`.
- Which differences are white space and which are customizations is the library's classification; the CLI shows what the library reports.
- Not decided: customizations of another feature, when the library learns one.

## Alternatives considered

- Keeping the old default (put everything back, `--keep-aligned` to opt out): rejected, the common case, a stray newline, ends with the feature reading not installed.
- Asking about each customization: rejected, one confirmation names them all and a flag decides.
- Replacing customizations silently: rejected, the plan and the question say what goes.
