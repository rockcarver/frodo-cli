---
status: superseded by 0054
date: 2026-11-16
decision-makers: maintainers
applies-to:
  - src/ops/DedicatedAgentKinds.ts
  - src/ops/ConfigManagerAgentKind.ts
  - src/configManagerOps/FrConfigOauth2AgentOps.ts
  - src/cli/config-manager/**
  - test/unit/DedicatedAgentKinds.test.js
issues:
  - rockcarver/frodo-cli#1346
  - rockcarver/frodo-cli#1254
  - rockcarver/frodo-cli#1259
  - rockcarver/frodo-cli#1249
---

# A config-manager object has one writer, and the generic agents kind skips a type that has a kind of its own

## Context and problem statement

`config-manager pull|push oauth2-agents` is file-driven and takes any agent type by name, so it wrote the same objects as the kinds built for trusted JWT issuers and CIMD profiles. Two writers of one object mean two files, two sets of overrides and a push that depends on which command ran last. [Everything an application owns lives in one folder](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0042-config-manager-keeps-everything-an-application-owns-in-one-folder.md) settled this for an OAuth2 client that an application owns. The tracking issue frodo-cli#1254 asked which other agent types get a kind and under which rules; the maintainer answered line by line.

## Decision

1. **One writer.** When an agent type has a kind of its own, `pull oauth2-agents` and `push oauth2-agents` skip it: one warning per realm and type that names the dedicated command; nothing is read, written or imported for it; no file of the user is changed. A skip is not an operation, so exit codes and `--allow-failures` do not change ([a thing that does not apply is not a thing that failed](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md)).
2. **One table.** The types are listed once, in `src/ops/DedicatedAgentKinds.ts`. A new kind adds its entry in the pull request that adds the kind, with a migration note, because a pipeline that pushed the type through `push oauth2-agents` stops pushing it. A test fails when an entry has no `pull` and no `push` command of that name.
3. **A kind per type**, opened when the maintainer orders it. There is no single discovery kind for all agent types.
4. **Dynamic.** Every agent type is dynamic configuration: its kind is in `pull all` and not in `pull all-static`, following the promotion FAQ of the platform. Changing that for a type is a decision of its own.
5. **Delete per kind.** A kind has its own `delete`, behind [the bulk-delete guard](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md). A type that stays on the generic kind has no config-manager delete.
6. **One file shape.** Files under `realms/<realm>/realm-config/agents/**` have the wrapped shape (`{ "inherited": ..., "value": ... }` per property) that the generic kind writes. A dedicated kind writes the same bytes the generic kind wrote for the object. Push accepts both shapes.
7. **Secrets of password-bearing types.** A secret that the server does not return is a placeholder named after the object and derived the way `esvToEnv` in `src/utils/FrConfig.ts` derives names (`${<ID>_PASSWORD}`). A missing variable fails the push and names it, as for an application; a pull without an override warns. Secrets are [never exported in the clear](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/core/0013-secrets-are-never-exported-in-the-clear.md).
8. **Availability.** In the generic kind an entry the user wrote is a request: a type the deployment lacks is a failed operation with the server's text. A dedicated kind for a type that a deployment may lack treats its absence as a non-event.

## Consequences

- The help of both generic commands names the dedicated kinds and says where overrides of a skipped type go (the overrides file of the dedicated command).
- Kept in sync: the table, `test/unit/DedicatedAgentKinds.test.js`, the help of both generic commands, `MIGRATION.md` and the `pull all` steps.
- Rules 6 and 7 bind kinds as they are built. A kind that does not follow a rule yet is a deviation tracked in an issue: the CIMD kind writes the plain shape and is brought to rule 6 by frodo-cli#1349.
- Not covered: AI agents and agent groups, which are out of scope for config-manager until the maintainer decides otherwise.

## Alternatives considered

- **One discovery kind `agents` for every type:** fewer commands, but the quirks of each type (secrets, availability, ownership) pile up in one command and `oauth2-agents` changes its meaning.
- **Only the generic kind:** nothing new to maintain, but the file must list every object and `pull all` finds none of them.
- **Plain files everywhere:** cleaner files, but every existing tree changes on its next pull.
