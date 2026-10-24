---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/utils/interactive/**
issues:
  - rockcarver/frodo-cli#886
---

# Interactive mode never prompts for what 4.x accepted

## Context and problem statement

Up to 4.x a command line either ran or failed with an error. The interactive mode of 5.x is ambient and gated (record 0014) and turns some of those failures into prompts (record 0015). It also began to prompt for things 4.x never needed: the realm picker opened for a command that was complete except for the realm (record 0001), and a command line that names a service account still opens the Connection page. Interactive mode needs one rule that stops it from changing what already worked.

## Decision

- A command line that ran successfully under 4.x runs successfully under 5.x and does not prompt.
- A command line that failed under 4.x because a mandatory argument or option was missing, or because of an invalid combination, may open a prompt instead of failing. That is the purpose of the interactive mode.
- A prompt only fills input that 4.x would have rejected. A change that makes a 4.x-valid command prompt is a defect; a change that makes a 4.x-failing command prompt is the purpose.
- The realm is never counted as missing. It has a default value (`alpha` on Identity Cloud, `/` on classic and ForgeOps), so a complete command never opens the realm picker. Record 0001 is an instance of this rule.
- A command line that already names a credential source is complete and does not open the Connection page: `--sa-id` and `--sa-jwk-file`, the Amster key file, `--browser` or `--device`, `FRODO_USERNAME` and `FRODO_PASSWORD`, or a saved profile for the host.

## Consequences

- A command that omits `realm` through `omits` has no realm positional. A command that keeps the `[realm]` positional keeps it, for the login realm and for 4.x scripts; the realm picker does not need it removed.
- Outside the gate of record 0014 behaviour stays byte-identical: same errors, same exit codes.
- A test for a new prompt names the 4.x command line that failed. A test for a case that must not prompt names the one that ran.
- Not decided: which 4.x-invalid command lines get a prompt. That stays a choice per command and per resolution step (record 0015).

## Alternatives considered

- Prompt for every optional input that is unset: rejected, it breaks scripts and the 4.x shorthand that record 0001 restored.
