---
status: accepted
date: 2026-10-14
decision-makers: maintainers
applies-to:
  - src/utils/interactive/CommandPreview.ts
---

# The command preview shows exactly the command a user would retype

## Context and problem statement

Every interactive surface doubles as an authoring tool: whatever the user chooses should end up as a command they can paste into a script. The footer of each prompt therefore shows the command being built. The behaviour is in `docs/INTERACTIVE-COMMANDS.md` ("The command preview"). Recorded retroactively; the colour rule was reversed on 2026-10-14 (the earlier rule was "green only after commit"). Checked on `main` (02a74335, 2026-10-24).

## Decision

- The footer is live: it is recomputed on every render, with the highlighted choice shadowed into a throwaway copy of the command. It is red and italic while the command is genuinely incomplete (no host, no credentials, a missing mandatory option, an unsatisfied one-of group) and green when the command as it stands would be valid. A valid-looking command must read valid, so highlighting a secret in an entity picker turns the footer green before any `[ENTER]`.
- Stages that cannot be satisfied by a highlight, such as the connection profile picker and the credentials page, stay red.
- Serialisation prints exactly the tokens a user would retype: positionals first (the password masked), then the options the user supplied in this invocation. Defaults and unset options never print; negatable flags the user typed print as the flag alone; repeated list options print as repeated flags.
- The realm sentinel never shows: the real realm of the deployment type prints instead, so a command pasted into a CI pipeline pins the value.
- On conclusion the resolved command prints once, in green, above the action's results. Abandoned or failed flows print nothing: a failed login and an escaped entity pick revoke the print.
- `CommandPreview.ts` has no imports of its own (pure commander serialisation), so unit tests can reach it.

## Consequences

- Measured: `serializeCommand` and the readiness thunk live in `CommandPreview.ts`; `test/unit/CommandPreview.test.ts` covers it.
- The map from deployment type to default realm is duplicated in `CommandPreview.ts` (zero-import constraint); a library change to that mapping needs the copy updated.
