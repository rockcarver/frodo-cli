---
status: proposed
date: 2026-11-08
decision-makers: maintainers
applies-to:
  - src/cli/config-manager/**
  - src/configManagerOps/**
  - src/ops/ApplicationOps.ts
issues:
  - rockcarver/frodo-cli#1101
  - rockcarver/frodo-lib#965
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
- **Other records apply.** Run all, one summary, `--allow-failures` (record 0040); a named application that does not exist fails the command whatever the flag says (record 0041). New code lives in `src/ops` (record 0023).

### Proposed, not yet decided

- **The layout belongs to the tree, not to the user.** A tree records which layout it uses; the per-user settings only set the default for a new tree. An existing tree is never switched silently.
- **Moving a tree is a deliberate step:** a command that moves owned objects into application folders. It is a breaking change for trees that hold them at their kind paths, so trees without the new kind keep working unchanged.
- **An object listed in a standalone kind's own config file but owned by an application** is skipped and the application is named. Failing is the alternative.
- **A delete** follows record 0037 and removes only the application record, never a piece other things may use.
- A prompt on overwrite is a separate setting and is not decided here.

## Consequences

- Reviewing or promoting one application is one folder, and an object has one writer. The cost is a second layout that the standalone kinds must know about.
- The no-duplicate rule needs the library's ownership index (frodo-lib#965) and cannot ship before it.
- To keep in sync once accepted: the help of the new kind and of the four standalone kinds (the skip), the contract test of record 0040 for the new kind, `MIGRATION.md` for the migration step, and the usage examples.
- Not covered: the file names inside an application folder, the name of the migration command, glossary values and request forms.

## Alternatives considered

- **Pieces stay at their kind paths** and the folder holds only the record: no migration, but an application is spread over many folders and a diff of one application touches all of them.
- **Both layouts write the same objects:** two files and two writers for one object, which can disagree.
- **Standalone kinds stop exporting application objects in every tree:** it breaks trees that hold them today, which is why the layout is a property of the tree.
