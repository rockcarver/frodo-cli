---
status: accepted
date: 2026-10-12
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/utils/interactive/DefaultsStore.ts
issues:
  - rockcarver/frodo-cli#796
---

# Missing input is resolved in one pass, in a fixed order, with a fixed precedence

## Context and problem statement

When a command is incomplete the CLI asks for what is missing. If each prompt decided for itself when to fire and which value wins, two runs of the same command could behave differently. The design is in `docs/INTERACTIVE-COMMANDS.md` ("The resolution pass", "Post-auth pickers"). Recorded retroactively and checked against the code on `main` (02a74335, 2026-10-24).

## Decision

- One resolution pass runs from `FrodoCommand`'s `preAction` hook, before the action body, and fills gaps in this order: persisted per-command defaults; connection arguments (host, then username and password); mandatory options; option-requiredness groups (record 0016); and, on `--prompt` or in guided mode, the invocation editor.
- Precedence of values: explicit flag, then environment variable, then persisted default, then built-in default.
- Persisted defaults live in `~/.frodo/Defaults.json`, keyed by the full command path, written only with `--save-defaults` and managed with `frodo settings defaults`. A saved default counts as user-authored configuration.
- The host comes from a dropdown of saved profiles (one profile is assumed, none means free text). Username and password are asked for only when no saved profile can supply credentials for the resolved host. They appear on one connection page that shows where each value came from.
- Every `makeOptionMandatory()` call site becomes prompt-capable without a syntax change: violations are deferred instead of thrown at parse time.
- Two pickers fire after login because their loaders need tokens: the entity pickers (record 0017) and the realm picker (record 0001). Prompts that fill a gap auto-select when there is a single option; prompts that are the purpose of the command always ask.
- Injected values are written to both `command.processedArgs` and `command.args`, because commander writes neither back.

## Consequences

- Measured: 63 call sites use `makeOptionMandatory`; all gain the prompt without change.
- A prompt added outside the pass is a review finding: it changes the order and the precedence.
- Every interactive edit needs a non-interactive equivalent (record 0020).
