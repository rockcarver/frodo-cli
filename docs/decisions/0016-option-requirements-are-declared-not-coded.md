---
status: accepted
date: 2026-10-12
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/cli/FrodoCommand.ts
  - src/app.commandWiring.test.ts
issues:
  - rockcarver/frodo-cli#796
---

# "At least one of" and "all together" are declared on the command, not coded in the action

## Context and problem statement

Commands used to end their action with an `else` branch that printed "Unrecognized combination of options or no options..." and the help, a dead end that gave an interactive user nothing and a script a vague error. 158 such dead ends existed. Declaring the requirement lets the framework prompt for the missing member in a terminal and fail with a standard error otherwise. Recorded retroactively and checked on `main` (02a74335, 2026-10-24).

## Decision

- A command declares which options it needs with `requireOneOf({ options, purpose })` (at least one of the group) and `requireAllOf(...)` (all together). The check runs after mandatory options.
- An unsatisfied group prompts in interactive mode (pick the member, then its value). Non-interactive runs fail with a commander-shaped error plus the help, before login, with exit code 1.
- When a dead-end `else` branch is converted, a bare `else { process.exitCode = 1; }` stays: the removed branches often doubled as the handler for a failed login.
- A guard test requires every command that still contains an "Unrecognized combination" branch to carry a declaration. When a declaration changes, the command's `client_cli` help snapshot is updated.
- Usage examples name one member of every `requireOneOf` group (record 0002).

## Consequences

- Measured: 106 declarations (103 `requireOneOf`, 3 `requireAllOf`) in command files; 42 command files still contain the old branch as a fallback and every one of them carries a declaration.
- A new command needs no "unrecognized combination" branch.
- A failed login still has to set the exit code in the action.
