---
status: accepted
date: 2026-10-12
decision-makers: maintainers
applies-to:
  - src/utils/interactive/PromptGateState.ts
  - src/cli/FrodoCommand.ts
issues:
  - rockcarver/frodo-cli#796
---

# Interactive mode is ambient, gated, and invisible outside the gate

## Context and problem statement

On a terminal, frodo fills gaps conversationally instead of failing with usage errors: it asks for a missing host, credentials, mandatory option or entity. The same CLI is used in pipelines and by agents, where a prompt that nobody can answer is a hang. The design is in `docs/INTERACTIVE-COMMANDS.md`; the layering rule is record 0005. This record fixes when the interactive mode may act. Recorded retroactively (decided October 2026) and checked against `PromptGateState.ts` on `main` (02a74335).

## Decision

- Interactivity is ambient: a command written the usual way gains it without per-command wiring.
- Nothing prompts unless every condition holds: `FRODO_NO_PROMPT` is unset and `--no-prompt` is not passed; `FRODO_TEST` is not `1`; both standard input and standard output are terminals; and `setNeverPrompt()` has not been called (protocol-channel surfaces such as `frodo mcp server start --transport stdio` call it).
- Outside the gate the behaviour is byte-identical to the CLI before the interactive mode: same errors, same exit codes. End-to-end snapshots depend on it.
- The switches are `--prompt` (open the invocation editor even when nothing is missing) and `--no-prompt` (never prompt; fail with the usual errors), plus the environment variable `FRODO_NO_PROMPT`. `--interactive` was rejected as a name and `--edit` retired. `frodo settings guided --on|--off` means "always `--prompt`".
- A pipeline sets `FRODO_NO_PROMPT=1` for the whole job; it does not rely on a pseudo-terminal being absent.

## Consequences

- Measured: the gate is one pure function (`canPrompt()`), with four conditions as above, covered by `PromptGateState.test.ts`.
- Because the e2e harness spawns with a terminal attached, an `isTTY`-only gate would hang tests; `FRODO_TEST=1` is part of the gate for that reason.
- A new surface that can prompt calls the gate; it does not read `isTTY` itself.
