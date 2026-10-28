---
status: proposed
date: 2026-10-28
decision-makers: maintainers
applies-to:
  - src/cli/**
  - src/utils/interactive/**
---

# A fix for a defect is not a departure from the 4.x rule

## Context and problem statement

Record 0030 says a command line that ran under 4.x keeps running under 5.x and does not start to prompt. Record 0032 makes one narrow exception to it. Some options were declared wrongly from the start and nobody noticed: an option that takes an optional value, so that its bare form stores a meaningless value (a password of `true`), or a mandatory option that a bare flag satisfies. Command lines that use them "ran" under 4.x, with a result nobody wanted. Read literally, record 0030 forbids fixing them, and every such fix would need its own exception.

## Decision

- A change that corrects a defect is not a violation of record 0030, or of any rule that says what ran under 4.x keeps running.
- A defect is behaviour that contradicts the command's own help or declaration, or that produces a result no valid input could mean: a credential set to `true`, a conflict that names no option, a mandatory option that no value satisfies.
- The fix is the smallest change that makes the command do what its help and declaration say. It adds nothing the old command never promised, apart from what the fix itself needs.
- The pull request names the defect and its evidence (the help text, the declaration or the output), says which command lines behave differently, and lists them in `MIGRATION.md` when a user can see the difference, as record 0032 does.
- A maintainer decides in the pull request whether it is a defect. A contributor or agent who is unsure says so there and does not decide alone.
- A change that alters what ran under 4.x and worked is not a fix. It stays under record 0030.

## Consequences

- Reviewers ask for the evidence. "Better behaviour" is not a defect, and a new prompt for a command line that worked is still a violation of record 0030.
- The old behaviour is not kept as an alias unless the pull request says why.
- Record 0030 stays accepted and unchanged. This record is its second stated exception, after record 0032.
- Not decided: which declarations are defective. That is judged per command, with the evidence above.

## Alternatives considered

- Edit record 0030: accepted records are not edited.
- Decide in each pull request without a record: the next contributor meets the same question.
- List the defects one by one: the list is out of date as soon as the next one is found.
