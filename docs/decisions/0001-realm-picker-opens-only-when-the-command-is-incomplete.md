---
status: accepted
date: 2026-10-23
decision-makers: maintainers
applies-to:
  - src/utils/interactive/RealmPickers.ts
  - src/cli/ResolveInteractiveInputs.ts
  - src/ops/AuthenticateOps.ts
issues:
  - rockcarver/frodo-cli#885
  - rockcarver/frodo-cli#906
---

# The realm picker opens only when the command is incomplete

## Context and problem statement

Up to 4.x a command could leave out the realm. frodo-lib then used the default realm of the detected deployment type (`alpha` on Identity Cloud, `/` on classic and ForgeOps), which kept Identity Cloud commands short. The interactive fallback of 5.0 added a realm picker (`RealmPickers.ts`), offered after authentication. As built, it opens for every command that declares a `[realm]` argument whose realm was not named, on any system with more than one realm, even when nothing else is missing. That broke the old shorthand (frodo-cli#885). The original design was that the picker belongs to the interactive connection flow and appears only when the user is already being asked to complete the command.

## Decision

- The realm picker stays where it is today: offered after authentication, from the `getTokens` wrapper, implemented in `RealmPickers.ts`. It is never removed.
- It opens only if interactive mode is already active because other mandatory connection settings were missing: the host, or any other mandatory connection argument or option.
- A command that is complete except for the realm does not open it. It runs against the deployment default realm.
- An explicit realm, as the `[realm]` argument or `FRODO_REALM`, never opens it.
- The existing conditions stay: prompting is allowed, the command declares a realm, and the system has more than one realm.

## Consequences

- `frodo journey list <profile>` and similar complete commands run against the default realm without a prompt, as in 4.x.
- The resolution pass must record whether it had to ask for any missing mandatory connection input, and the picker must check that record.
- The picker keeps its tests, including Escape keeping the default realm.
- `docs/INTERACTIVE-COMMANDS.md` ("Post-auth pickers") must state the same rule.
- The pull request that implements this, frodo-cli#906 when this record was written, must follow it.

## Alternatives considered

- Removing the picker: rejected. Users who are already completing a command interactively still want to choose a realm.
- Opening it whenever the realm is omitted, the 5.0 behaviour: rejected, it breaks the 4.x shorthand.
