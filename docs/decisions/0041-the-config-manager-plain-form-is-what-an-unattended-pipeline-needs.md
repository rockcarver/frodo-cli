---
status: accepted
date: 2026-11-07
decision-makers: maintainers
applies-to:
  - src/cli/config-manager/**
  - src/configManagerOps/**
issues:
  - rockcarver/frodo-cli#1087
  - rockcarver/frodo-cli#1112
---

# The config-manager plain form is what an unattended pipeline needs

## Context and problem statement

The config-manager commands are meant for pipelines, and the maintainers agreed with a major user that the common use case is the default: a pipeline runs the plain form of a command, and an option exists only for an exception. When this was decided, on 2026-11-07, a read-only audit of the group found plain forms that need more than the connection. `pull all` failed when a conventional input file such as the SAML list was absent, so a pipeline without that kind needed `--allow-failures`, which also hides real failures (record 0040). One delete command failed on an empty tenant while its four siblings succeeded, and a named script that did not exist was only a warning for a push but a failure for a delete.

## Decision

- **Plain form.** The plain form of a config-manager command is the command, the connection (host or profile, credentials from the environment) and optionally the realm. A mandatory option is allowed only for content the command cannot guess, such as a value to write. Everything else has a default, and an option exists for the exception.
- **Named or discovered.** What the command line names (a kind to push, `-f`, `-n`, an id) must exist: if it does not, the command says so in plain words and exits with a failure code (record 0033). What a command finds by convention, such as the input files of `pull all`, may be absent: the step is skipped with a visible warning that names the file and the folder, and it does not fail the command. A file that exists but cannot be read or parsed is a failure.
- **Nothing to do is success.** Nothing to export or to delete, when no item was named, ends with exit code 0 and a message that says so. A named item that is not there is a failure, as above.
- **Bulk delete.** Record 0037 stands: asking first, or `--yes` without a terminal, is the one documented exception to the plain form. It is a safety guard, not a default.
- **Failures stay failures.** This record never turns a failed operation into a success. Record 0040 still decides how a run with failures ends, and `--allow-failures` is for a pipeline that accepts them.

## Consequences

- A typo in a conventional file name becomes a warning, not a failure. The warning names the folder it looked in, so the typo is visible.
- Each command brought under this rule says so in its help and in `MIGRATION.md` when its exit code changes. The group is experimental (core 0019), so the entry is welcome, not required.
- Commands that do not follow these rules yet are listed in rockcarver/frodo-cli#1112 and are brought under them one change at a time. To keep in sync: the help text of `pull all` that names the conventional files.
- Not decided here: whether promotion, rollback and restart wait for completion by default; whether a non-empty `CI` variable switches prompts off (record 0014); how progress is drawn when there is no terminal; a default for the config folder of `pull all`. Each needs its own decision.
