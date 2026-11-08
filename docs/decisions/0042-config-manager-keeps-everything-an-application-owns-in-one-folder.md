---
status: accepted
date: 2026-11-08
decision-makers: maintainers
applies-to:
  - src/cli/config-manager/**
  - src/configManagerOps/**
  - src/ops/ApplicationOps.ts
issues:
  - rockcarver/frodo-cli#1101
  - rockcarver/frodo-lib#965
  - rockcarver/frodo-cli#1153
  - rockcarver/frodo-lib#966
---

# Config-manager keeps everything an application owns in one folder per application

## Context and problem statement

An application is a record that points at other objects: the OAuth2 client or the SAML providers people sign in with, the connector and mappings that provision it, and shared pieces such as scripts and circles of trust. The config-manager kinds for OAuth2 agents, SAML, connector definitions and connector mappings already export some of these on their own. An application kind that wrote them too would leave two files and two writers for one object. Ids differ between environments, and secrets must not be written in the clear (core 0013). When this was decided, on 2026-11-08, the library could say what an application refers to and whether each reference is owned or shared, but not which application owns a given object (frodo-lib#965).

## Decision

### Decided by the maintainers

- **The whole application.** `pull applications` writes the application and everything it needs, and a push creates everything, so a tree is complete. An application command never relies on the user running another command: shared pieces (scripts, circles of trust and the like) are pulled and pushed by it too, at the paths of their own kinds. The kind is part of `pull all`, and not of `pull all-static` until a promotion dry run settles it.
- **One folder per application.** Under the realm, named by the application name, holding the application record and the objects it owns (the OAuth2 client, the SAML providers, the connector and its mappings), as the library's `owned` references say. Files use the diff-friendly formats of the other config-manager kinds.
- **No duplicate artifacts.** In a tree that uses this layout the standalone kinds neither write nor push an object an application owns. They report it as skipped and name the application; that is not a failure.
- **The name is the identity.** A push matches by application name: update in place under the target's id, else create. Files carry no `_id` or `_rev`. The relationships to users (members, owners, roles) are never pulled or pushed.
- **Secrets are placeholders** filled from the environment on push, as the OAuth2-agents overrides are (core 0013). A missing variable fails that application and names the variable.
- **Out of the first version:** glossary values and request forms (rockcarver/frodo-cli#1132). The help says so.
- **The layout belongs to the tree.** A tree records which layout it uses (a marker at its root); the per-user settings only set the layout of a new tree. An existing tree is never switched silently.
- **Moving a tree is a deliberate step.** A migration command, with a preview, moves the owned objects into application folders and updates the marker. It is a breaking change for trees that hold them at their kind paths, so trees without the new kind keep working unchanged.
- **An object listed in a standalone kind's own config file but owned by an application** is skipped and the application is named. That is not a failure.
- **A delete removes the application and what it owns.** The record goes first, then the owned objects, never the shared pieces; an owned object that another application still names is kept. It asks first and offers a preview (record 0037), and each removal is one operation of the run (record 0040). A provisioning application whose connector is active is not deleted: the refusal names the command that switches the application off, and there is no override option.
- **Other records apply.** Run all, one summary, `--allow-failures` (record 0040); a named application that does not exist fails the command whatever the flag says (record 0041). New code lives in `src/ops` (record 0023).

## Consequences

- Reviewing or promoting one application is one folder, and an object has one writer. The cost is a second layout that the standalone kinds must know about.
- The no-duplicate rule and the delete of owned objects need the library's ownership index (frodo-lib#965); the refusal of an active application needs the commands that read and change whether an application is active (frodo-cli#1153, frodo-lib#966). None of them can ship before those.
- To keep in sync once accepted: the help of the new kind and of the four standalone kinds (the skip), the contract test of record 0040 for the new kind, `MIGRATION.md` for the migration step, and the usage examples.
- Not covered: the file names inside an application folder, the name of the migration command, glossary values and request forms, and a prompt on overwrite, which is a separate setting for its own record (frodo-cli#104).

## Alternatives considered

- **Pieces stay at their kind paths** and the folder holds only the record: no migration, but an application is spread over many folders and a diff of one application touches all of them.
- **Both layouts write the same objects:** two files and two writers for one object, which can disagree.
- **A delete that removes only the application record:** the owned objects stay in the tenant and, owned by nothing any more, come back into the standalone kinds on the next pull.
- **Standalone kinds stop exporting application objects in every tree:** it breaks trees that hold them today, which is why the layout is a property of the tree.
