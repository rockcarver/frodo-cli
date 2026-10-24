---
status: accepted
date: 2026-10-23
decision-makers: maintainers
applies-to:
  - src/cli/**
issues:
  - rockcarver/frodo-cli#888
---

# Every new command ships usage examples

## Context and problem statement

The command template has carried a "Usage Examples" block since 2024, but nothing checked it. When it was measured, 58 of the 340 commands had examples, and most commands added in 2026 had none. A command without examples is harder to learn and to script.

## Decision

- Every new command has a `Usage Examples:` block, shown by `-hhh`, in the style of `frodo info` and `frodo conn save`: one sentence, then the command. There is one example per mode or option that matters, with a login variant.
- Sample values come from `src/help/SampleData.ts`. Missing constants are added there.
- `test/unit/UsageExamples.test.js` fails for a command without examples. Commands that predate the rule are on `test/unit/UsageExamplesLegacyExceptions.js` (282 when this record was written). That list only shrinks: never add a command to it, and delete a line when you add examples.
- What an example must and must not do is decided in record 0002.

## Consequences

- Giving the legacy commands examples is incremental work, and each one reduces the list.
- A new command that ships without examples fails the unit tests.
