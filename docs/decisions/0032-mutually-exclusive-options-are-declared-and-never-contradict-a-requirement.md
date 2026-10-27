---
status: accepted
date: 2026-10-27
decision-makers: maintainers
applies-to:
  - src/cli/**
  - test/unit/OptionConflicts.test.js
  - test/utils/OptionConflicts.js
issues:
  - rockcarver/frodo-cli#968
  - rockcarver/frodo-cli#967
---

# Mutually exclusive options are declared with `.conflicts()` and never contradict a requirement

## Context and problem statement

Many options were documented as "Ignored with -x": the command accepted both and silently dropped one. About a hundred of them became errors through `.conflicts()`. Commander checks conflicts while parsing, before the requirement groups of record 0016 and before the interactive resolver run. A conflict can therefore make a requirement impossible to meet (an option that conflicts with a required one can never be used), name an option the command does not have (so it never fires), or reject a combination the command really handles. The first merge held one of each. Record 0030 says a command line that ran under 4.x keeps running under 5.x, and rejecting an ignored combination departs from that on purpose. This record writes down the rules and that one exception. It was written after the change merged.

## Decision

- Two options that cannot be combined are declared with `.conflicts()` on both options, each naming the other by its attribute name (camelCase; for a negatable `--no-x` option the attribute name is `x`). The help says "Cannot be used with ...".
- A conflict never contradicts a requirement. Options that must be present (`requireAllOf` members, mandatory options) do not conflict with each other, no option conflicts with a required one, and every member of a `requireOneOf` group stays usable in at least one valid invocation. Mutually exclusive members of one group are the intended "exactly one" form.
- A conflict names only options of the same command, and every `requireOneOf` / `requireAllOf` member is an option of the command. A test over the whole command tree enforces this rule and the one before it.
- A modifier option conflicts with a one-of member only where that member's branch of the action ignores the modifier. Read the branch before declaring the conflict; no test can judge it.
- Exception to the first rule of record 0030: a combination that 4.x accepted only by ignoring one of its options (the help said "Ignored with ...") may be rejected in 5.x. Each such rejection is listed in `MIGRATION.md`. Nothing else that ran under 4.x may start to fail.
- Interactive mode honors the same conflicts: a picker offers no member that conflicts with an option already set, the options editor blocks such an option, and a saved default that conflicts is skipped. An option that a picker reads to scope its list is not a conflict for that picker.

## Consequences

- The guard (`test/unit/OptionConflicts.test.js`, checker in `test/utils/OptionConflicts.js`) fails on a conflict target that names no option, a requirement member that is not an option, and a conflict that contradicts a requirement.
- A newly rejected combination is a breaking change: add it to `MIGRATION.md` in the same pull request, and update the command's help snapshot (record 0016).
- Not yet true: the last rule. Interactive mode still offers members that conflict with an option already set, and values it fills in are not re-checked. Tracked in #967, written against commit 660b0162.
- Not covered: whether a given conflict is right for its action.
