---
status: accepted
date: 2026-11-06
decision-makers: maintainers
applies-to:
  - src/ops/**
  - src/cli/**
issues:
  - rockcarver/frodo-cli#1053
---

# The library holds the common functions and the CLI composes them into commands

## Context and problem statement

[core 0001](core/0001-library-is-the-brain-cli-is-a-thin-wrapper.md) and record 0007 say that a feature other consumers would also need is built library first, and that the CLI wraps the library. Records 0023, 0024 and 0026 measured places where logic that other consumers would need had ended up in the CLI, and each ends with "deprecated and not extended: new behaviour is built library first".

Read literally, that sentence also forbids a new CLI command that strings several library functions into one workflow. That is what a command such as `frodo admin create-oauth2-client-with-admin-privileges` does, and it leaves open which part of a command has to move. When the question came up on 2026-11-05 (a command that sets something up across two connections), the records pointed at the library for the whole workflow. That costs a library release and takes prompts, confirmation and progress out of the CLI, where they belong.

## Decision

- **A common function is library first.** A function belongs in the library when a script, the MCP server or another tool would also call it on its own: domain rules, API calls, data handling, and rules about the platform such as which scopes and roles count as privileged. It is exposed through the facade, and the CLI never reimplements or works around it (core 0001, record 0007).
- **Composition is the CLI's own work.** A command may string several library functions into one workflow in `src/ops/`: the order of the steps, work across more than one connection, defaults, confirmation, dry run, progress and the wording of results. It does not move into the library because it has several steps or touches several modules.
- **The line between the two.** Composition passes data from one library call to the next and decides what to tell the user. If a step needs a rule or a call that the library lacks and that a second consumer would also need, that step is added to the library first and composed afterwards. A rule copied into `src/ops/` is a common function in the wrong place.
- Composing ops functions keep the rules of records 0005, 0007 and 0009: they do not prompt, they are named after the command verb, and they reach the library only through the facade.
- **Record 0026 is replaced.** The `frodo admin` commands are composition and stay in the CLI. The deviation 0026 measured is the part that is a common function: the privilege and protection rules and the way a static user mapping is changed. Those are re-homed in the library when they are next touched, in the direction 0026 describes.
- **Records 0023, 0024 and 0025 are not changed by this record.** They keep their measurements and their status. Whether the file layout, splitting an export into files and combining files belong in the library, as 0024 assumes, is a decision of its own.

## Consequences

- A reviewer asks one question of a function in `src/ops/`: would another consumer call this on its own? If yes, it belongs in the library.
- A command that composes existing library functions needs no library release of its own, only those of the functions it composes.
- The admin commands are no longer a deviation as a whole; the platform rules in `src/ops/AdminOps.ts` still are.
- To keep in sync: the status of 0026 (`superseded by 0036`) and both index rows, and the guidance that tells a contributor to stop when the library lacks a capability (the `add-a-cli-command` skill, `.github/instructions/cli-commands.instructions.md`, `docs/CONTRIBUTE.md`), which says that a workflow composing existing library functions needs no stop.
- Core 0001 is not changed; its "thin wrapper" wording is read together with this record.
- Not covered: what happens to the library's commented-out copy of the admin functions (the library's own records decide), and whether the CLI should take a larger share than core 0001 gives it, which only a core record can decide.

## Alternatives considered

- Edit the wording of 0026: an accepted record is superseded, not edited.
- Build every multi-step workflow in the library: reusable, but one more release per workflow, and the interactive parts become callbacks.
