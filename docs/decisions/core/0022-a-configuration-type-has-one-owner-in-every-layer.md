---
status: proposed
date: 2026-11-11
decision-makers:
  - maintainers
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
applies-to:
  - src/ops/**
  - src/cli/**
  - src/configManagerOps/**
issues:
  - rockcarver/frodo-lib#1032
  - rockcarver/frodo-lib#1017
  - rockcarver/frodo-lib#1029
  - rockcarver/frodo-cli#1234
  - rockcarver/frodo-cli#1249
---

# A configuration type has one owner in every layer

## Context and problem statement

Some configuration types are handled by a dedicated module while the generic code of their family handles them too. When this was decided, on 2026-11-11, the library's generic agent code read every agent type that a realm lists, so a full export held every trusted JWT issuer twice and a full import wrote it twice, from 4.0.0 on. The same pattern exists above the library: the generic `agent` commands act on a type that has a command family of its own, and a generic config-manager kind and a dedicated kind can write the same file. Each copy is harmless alone and wrong together: duplicate content, a second writer that silently wins, failures reported twice, and a bulk delete that removes what another owner manages.

## Decision

- A configuration type has one owner in the library: the module that reads and writes it. The generic code of its family skips the type (for agent types, the constant `AGENT_TYPES_WITH_OWN_MODULE` in `src/ops/AgentOps.ts`) and keeps accepting it on import, so earlier exports still import.
- A full export holds each object under exactly one key, the owner's. A test fails when an object appears under two keys or under none, and when the list of owned types and the keys of the owners disagree.
- A type that the command line manages has one command family; the generic commands of its family do not list, export or delete it.
- A type that config-manager manages has one kind; the generic kinds skip the type, name the owning kind and report the skip, not a failure.
- Changing the owner of a type is done in this order: the new owner is added and released, the generic code is made tolerant of the old layout, the generic code then lets go. The change is a `MIGRATION.md` item in each repository, because the generic surface it leaves is stable.

## Consequences

- A pull request that gives a type its own module also adds the type to the constant, gives it its own key in a full export and its row in the guard test, and changes the generic code of every layer that handles the family.
- Users of the generic commands lose the type there and must use the owner; the release notes say so.
- Mixed versions: an export of the new layout is not read for that type by an older release, which skips the key.

## Known deviations

When this record was written, on 2026-11-11, the library followed it: the pull request that adds this record (frodo-lib#1032, with #1017 and #1029) moves trusted JWT issuers and CIMD profiles to their modules, on top of frodo-lib commit a09ac120f. The command line and config-manager did not yet: the generic `agent` commands and the generic `oauth2-agents` kind still handled both types. They are tracked in rockcarver/frodo-cli#1234 and rockcarver/frodo-cli#1249. The pull request that closes both removes this section from both repositories.
