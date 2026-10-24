---
status: accepted
date: 2026-10-12
decision-makers: maintainers
applies-to:
  - src/cli/conn/**
  - src/cli/settings/**
  - src/cli/FrodoCommand.ts
---

# Every interactive edit has a non-interactive equivalent, and containers and action stubs behave alike

## Context and problem statement

An interactive surface is a convenience, never the only way to do something: pipelines and agents cannot answer a prompt. Commands that own an interactive mode (`conn`, `settings`) also sit in a command tree that users browse. The behaviour is described in `docs/INTERACTIVE-COMMANDS.md` ("Stubs: containers, action stubs, and the Run row"). Recorded retroactively (decided 2026-10-12) and checked against the code on `main` (75c58f4c, 2026-10-24).

## Decision

- Every field a user can edit interactively can also be set non-interactively. The editing verb is one `set` sub-command per command (`frodo conn set <host> --field value ...`; bare `frodo conn set` lists the settable fields), never one sub-command per field. A new profile field is a new option in that command's registry, never a new command.
- Every command is either a live command (`FrodoCommand`: the resolution pass, the `--prompt` editor, `--no-prompt` fails the legacy way) or a container (`FrodoStubCommand`).
- A pure container (`journey`, `esv`, `log`, ...) opens the sub-command picker on a bare invocation; its help carries the standard line "Run without a sub-command to enter interactive mode." and lists `--no-prompt` only.
- An action stub (`conn`, `settings`) is a full command whose bare invocation runs its own interactive mode. Its sub-command picker carries a Run row first, so the tree stays browsable. `--prompt` shows the sub-command picker instead of the action; `--no-prompt` makes the action decline without prompting, like Escape.
- Declining an action stub's bare mode (Escape, or the gate blocking it) steps back to the sub-command picker; a double Escape never declines, it exits everything (record 0018).
- No skip list for the sub-command picker: `mcp` and `log` get it too. Only stubs with their own bare action (`conn`, `settings`, `login`, `shell`) are untouched.

## Consequences

- Measured: `conn set` exists next to the interactive `conn` mode; the two classes are `FrodoCommand` and `FrodoStubCommand` in `FrodoCommand.ts`.
- A reviewer asks for a `set`-style equivalent whenever a pull request adds an interactive edit.
