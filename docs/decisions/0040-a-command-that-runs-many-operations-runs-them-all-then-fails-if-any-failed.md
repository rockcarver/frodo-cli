---
status: accepted
date: 2026-11-07
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/ops/**
  - src/configManagerOps/**
issues:
  - rockcarver/frodo-cli#1087
---

# A command that runs many operations runs them all, then fails if any failed

## Context and problem statement

Import, export and config-manager commands are run unattended in pipelines, which read only the exit code. Many of them perform several operations: the items of a bulk (`-A`, `--all`) or the steps of an "all" command. When this was decided, on 2026-11-07, sampling showed three behaviours: one export collects every failure and throws once at the end; another swallows a failed item and still exits 0; the config-manager "all" commands ignore the result of each step. A swallowed failure leaves a green pipeline and a configuration that is silently incomplete. Stopping at the first error is no better: it hides every later problem and leaves a partial result without saying what is missing. When decided, 64 of 71 import and export commands outside `config-manager` had a bulk flag.

## Decision

- A command that performs several operations (a multi-op command) runs every independent operation, even after one failed. A failed operation is recorded with its name and its reason.
- After the last operation the command prints one summary: how many failed out of how many, and which. If any failed, it sets `process.exitCode = 1` (record 0033) and returns. If none failed, the exit code is not touched.
- A failure is an operation that could not do what was asked: an item that could not be read, written or applied. Nothing to export, not applicable to this tenant, and skipped on request are not failures.
- Every multi-op command accepts `--allow-failures`. With it the failures are still printed and summarised, but they do not set the exit code. The option is defined once, with one help text, and the framework adds it; a command does not declare its own.
- A failure that the next operations cannot run without (a failed login, a step another step depends on) ends the run, says which operations were not attempted, and exits 1 whatever `--allow-failures` says.
- An ops function reports failure through its return value or through one error that carries every individual failure. It never swallows one: no empty `catch`, no result that is ignored.
- Exceptions need a new record.

## Consequences

- A command that exited 0 after a swallowed failure now exits 1. `MIGRATION.md` names `--allow-failures` as the flag a script adds to keep the old exit code.
- A contract test drives every multi-op command against the fake tenant with one operation failing, and checks that the others ran, that the failure is named in the summary, that the exit code is 1, and that `--allow-failures` gives 0. A command that does not conform yet is on a legacy exceptions list in `test/unit` that only shrinks; a new multi-op command passes from the start.
- The shared option and the summary live in one module, so a command writes neither.
- The script export is the model for how an ops function collects failures.
- Not covered: retries, and the order in which independent operations run.

## Alternatives considered

Stop at the first error: simple, but it hides every later failure and leaves an unknown partial result. Report failures and exit 0 (the behaviour of the swallowing commands): a green pipeline with missing configuration. Make failing late opt-in: the unsafe behaviour would stay the default for unattended runs. Take the opt-out from an environment variable only: invisible in `-h` and in the pipeline file.
