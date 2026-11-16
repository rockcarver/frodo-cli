---
status: accepted
date: 2026-11-16
decision-makers: maintainers
applies-to:
  - src/ops/DedicatedAgentKinds.ts
  - src/ops/ConfigManagerAgentKind.ts
  - src/configManagerOps/FrConfigOauth2AgentOps.ts
  - src/ops/ApplicationConfigOps.ts
  - src/cli/config-manager/**
  - test/unit/DedicatedAgentKinds.test.js
issues:
  - rockcarver/frodo-cli#1355
  - rockcarver/frodo-cli#1254
  - rockcarver/frodo-cli#1346
---

# A config-manager object has one writer, and agent files are written in the plain shape

## Context and problem statement

[Record 0053](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0053-a-config-manager-object-has-one-writer-and-the-generic-agents-kind-skips-a-type-that-has-a-kind-of-its-own.md) decided who writes an agent object and that the files keep the shape AM answers a single read with: every property as `{ "inherited": ..., "value": ... }`. No writer of these files unwraps it, and the shape was chosen before its cost was measured. Measured on 2026-11-16 on the committed config-manager agent files: 861 wrappers, 138 of them empty `{ "inherited": false }` placeholders, and 4331 lines against 1748 without the wrappers; the traditional `frodo agent export` writes the plain shape. These files exist so that a version-control diff shows what changed, and the noisiest types (Java and Web agents, OAuth2 clients) stay on the generic kind, so a rule for the new kinds alone would lose most of the gain (frodo-cli#1355). This record replaces 0053 as a whole and changes only its rule 6; the other rules are restated so that it stands alone.

## Decision

1. **One writer.** When an agent type has a kind of its own, `pull oauth2-agents` and `push oauth2-agents` skip it: one warning per realm and type that names the dedicated command; nothing is read, written or imported for it; no file of the user is changed. A skip is not an operation, so exit codes and `--allow-failures` do not change ([a thing that does not apply is not a thing that failed](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md)).
2. **One table.** The types are listed once, in `src/ops/DedicatedAgentKinds.ts`. A new kind adds its entry and a migration note in the pull request that adds the kind. A test fails when an entry has no `pull` and no `push` command of that name.
3. **A kind per type**, opened when the maintainer orders it. There is no single discovery kind for all agent types.
4. **Dynamic.** Every agent type is dynamic configuration: its kind is in `pull all` and not in `pull all-static`, following the promotion FAQ of the platform. Changing that for a type is a decision of its own.
5. **Delete per kind.** A kind has its own `delete`, behind [the bulk-delete guard](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md). A type that stays on the generic kind has no config-manager delete.
6. **Plain shape.** Files under `realms/<realm>/realm-config/agents/**` are written in the plain shape. A pull reads the single object (AM's writable shape, `{ inherited, value }` per property) and normalises it with one function that every writer of these files uses: the shared agent-kind module, the generic `pull oauth2-agents` and the application kind's OAuth2 client file. A property set on the object is written as its value; an unset property (`{ inherited: false }`) and an inherited property (`{ inherited: true, ... }`) are not written, and the verbose output says how many were left out. Push accepts the plain and the wrapped shape and is not changed. Overrides apply to the plain value.
7. **Secrets of password-bearing types.** A secret that the server does not return is a placeholder named after the object and derived the way `esvToEnv` in `src/utils/FrConfig.ts` derives names (`${<ID>_PASSWORD}`). A missing variable fails the push and names it, as for an application; a pull without an override warns. Secrets are [never exported in the clear](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/core/0013-secrets-are-never-exported-in-the-clear.md).
8. **Availability.** In the generic kind an entry the user wrote is a request: a type the deployment lacks is a failed operation with the server's text. A dedicated kind for a type that a deployment may lack treats its absence as a non-event.

## Consequences

- A tree written with the wrapped shape changes on its next pull and `MIGRATION.md` says so. The change is made in the 5.0.0 major release, which [may change output](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md).
- Until frodo-cli#1355 is merged every writer of these files writes the wrapped shape: the three kinds, the generic kind and the application kind's OAuth2 client file. That deviation is tracked there.
- Kept in sync: the normalising function and its tests, the help and overrides examples of the commands, the table of rule 2 and its test, the help of both generic commands and `MIGRATION.md`.
- Not covered: AI agents and agent groups, which are out of scope for config-manager until the maintainer decides otherwise; sorting of keys and other noise, which is decided apart.

## Alternatives considered

- **Keep the wrapped shape (record 0053):** consistent with the trees written so far, but every diff carries the wrappers and the empty placeholders.
- **Plain shape for the new kinds only:** the noisiest types stay on the generic kind, so most of the gain is lost and a tree holds two shapes.
- **One discovery kind `agents` for every type:** fewer commands, but the quirks of each type (secrets, availability, ownership) pile up in one command and `oauth2-agents` changes its meaning.
- **Only the generic kind:** nothing new to maintain, but the file must list every object and `pull all` finds none of them.
