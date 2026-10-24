---
status: accepted
date: 2026-10-14
decision-makers: maintainers
applies-to:
  - src/utils/interactive/EntityPickers.ts
  - src/cli/**/*-delete.ts
---

# A declined or failed entity pick never runs the command's body

## Context and problem statement

A command whose target option (`-i, --secret-id` and the like) was left out can offer a dropdown filled from the live system. Several delete commands treat "no target" as "all" (`--all`). If the dropdown could not be filled, or the user pressed Escape, running the body anyway would run the destructive default. A regression test pins the rule. Recorded retroactively (the rule and its test date from 2026-10-14) and checked on `main` (02a74335, 2026-10-24).

## Decision

- Entity pickers (`EntityPickers.ts`) run after login. A command registers them at setup with `deferEntityPicks`; the resolver skips the free-text step for pickable options.
- A picker that is declined (Escape) or whose loader fails returns false, and the command stops without running its body, with exit code 1. A failed load prints its error. It is never treated as a satisfied pick.
- The call-site shape stays `(options.all || (await resolveEntityPicks(command)))`, so false means stop. A command that deletes must not be reachable through a path where a pick that did not happen counts as done.
- A single candidate is selected automatically; an empty list is a satisfied pick.

## Consequences

- Measured: 25 call sites of `resolveEntityPicks` in command files; `EntityPickers.test.ts` pins that a failing loader declines the pick and leaves the option untouched.
- Before a picker is added to a delete command, check what the command does when the pick does not happen.
