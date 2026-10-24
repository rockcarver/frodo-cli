---
status: accepted
date: 2026-10-12
decision-makers: maintainers
applies-to:
  - src/utils/interactive/**
  - src/ops/**
  - src/cli/**
issues:
  - rockcarver/frodo-cli#796
---

# Interactive code has one home and one import direction

## Context and problem statement

The interactive framework is ambient: a developer adds a command the way they always have and it gains interactivity automatically (the resolution pass, the connection page, the pickers, the invocation editor). That only works if command files and operations carry no prompting code of their own, and if the layers import each other in one direction.

## Decision

- All prompt code lives in `src/utils/interactive/`: the framework, every reusable picker, and the prompts of natively interactive commands. Command files in `src/cli/` import it plainly or not at all.
- `src/utils/interactive/` never imports from `src/ops/`. A prompt takes its data loader as a parameter and the command file injects it. The one sanctioned exception is `JourneyDebugPrompt` importing `JourneyDebugAggregator`, which is the prompt's data model.
- `src/ops/` does not prompt. The one exception is a single proceed-or-abort gate inside an operation, as in `LoginSetupOps`; never value collection, resolver prompting or a standalone picker.
- Types both layers need live in `src/utils/interactive/`, so no layer imports a type across the boundary. Plain text helpers both layers need live in `src/utils/TextLayout.ts`, which has no imports.
- `AuthenticateOps` reaches prompt code through lazy `await import()` so that the frodo-lib module graph stays clean for the Jest mocks.

## Consequences

- A new prompting command needs no per-command wiring, and a new prompt is a new file in one folder.
- The exceptions are named in `docs/INTERACTIVE-COMMANDS.md` ("Layering: where interactive code lives"). A new one needs a new record.
