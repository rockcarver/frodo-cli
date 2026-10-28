---
status: proposed
date: 2026-10-27
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/ops/**
  - src/configManagerOps/**
  - src/utils/**
issues:
  - rockcarver/frodo-cli#974
---

# Code sets the exit code and returns instead of calling `process.exit()`

## Context and problem statement

A failed command must leave a non-zero exit code. Code can set `process.exitCode` and return, or call `process.exit()`. The call ends the process at once, even with output still being written, and skips whatever would have run after it: stopping a progress indicator, closing a session, a `finally` block. It also cannot be undone by a caller, so an ops function that exits cannot be reused or tested. The CLI prints through pipes to scripts and to the end-to-end tests, where a cut-off line is a missing line.

When this was decided, on 2026-10-27, 891 lines set `process.exitCode` in 355 files, and 36 calls to `process.exit()` stood in 34 files. 31 of them are the same login line, `if (!getTokensIsSuccessful) process.exit(1);`, copied through the config-manager commands. The others are two in one config-manager command, one in an ops function, one in the help path of the command framework and one in the crash handler of the MCP server.

## Decision

- Code under `src/` does not call `process.exit()`. To fail, it sets `process.exitCode` to a non-zero value and returns, so pending output is written and cleanup runs.
- A command action that cannot continue, for example because login failed, writes `process.exitCode = 1;` and returns. An ops function or utility never ends the process: it reports failure through its return value or an error, and the command sets the exit code (record 0008).
- The exceptions are these two. A handler of a fatal, unrecoverable condition, such as an uncaught exception in a long-running server, may call it after it has closed what it can. The command framework may call it to stop after it printed help.
- Any other exception is a new record.

## Consequences

- Reviewers and agents reject a new call outside the exceptions. The idiom to copy is `process.exitCode = 1; return;`.
- The calls that this rule rejects stay until a clean-up replaces them. The intended enforcement is a lint rule that rejects the call and marks the exceptions; until it exists, review is the check.
- The command guidance (`.github/instructions/cli-commands.instructions.md` and the add-a-cli-command skill) should show the idiom, so that the copied line stops spreading.
- A command that needs a specific non-zero code still sets `process.exitCode`.

## Alternatives considered

Allow `process.exit()` after an error message in commands: shorter to write, but it can cut off output on a pipe and skips cleanup. Wrap it in a helper that flushes first: more machinery to keep than setting a property.
