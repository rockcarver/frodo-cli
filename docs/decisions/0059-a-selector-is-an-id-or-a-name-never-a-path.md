---
status: proposed
date: 2026-11-19
decision-makers: maintainers
applies-to:
  - src/utils/ConfigTreePath.ts
  - src/cli/FrodoCommand.ts
  - src/cli/config-manager/**
  - src/configManagerOps/**
  - src/ops/ConfigManagerAgentKind.ts
  - src/ops/RemoteProxyOps.ts
issues:
  - rockcarver/frodo-cli#1264
  - rockcarver/frodo-cli#1365
---

# A selector is an id or a name, never a path

## Context and problem statement

A selector (`-i`, `-n`, `--name`) names one object of a type, and the realm says where it lives. A pull writes a file or a folder for every object, so the type, the realm, the id and the working directory (`-D`) are all a push needs to find it again. Some commands built a path, or the address of a request, from the typed text itself. A value written as a path was then followed as one, and the working directory stopped being the limit of what a command reads or writes. The commands of the configuration group ([0056](0056-the-configuration-command-group.md)) share the selector options of [0057](0057-options-of-the-configuration-commands.md), so one rule has to cover them.

## Decision

- **A selector is an id or a name, never a path.** No command reads or writes a path that a selector or a realm spells.
- **The file or folder of an object is derived from its id or name** by `src/utils/ConfigTreePath.ts`: the name that a pull writes for an id, with a character that a file name cannot hold written as `%XX` (`/` is `%2F`) and the name cut to what a file name can hold. For the types that a pull writes with the plain name, the plain name is also found when it is one safe segment: no `/` or `\`, not `.` or `..`, no control character. The result must lie inside the folder of the type, and a folder of an object is never the folder of the type itself.
- **A value that does not lead to a file is a name that no file has.** The named-object failure of [0041](0041-the-config-manager-plain-form-is-what-an-unattended-pipeline-needs.md) applies: exit code 1, whatever `--allow-failures` says, and the message names the file that was looked for.
- **A realm is `/`, a name or a path of names** such as `/parent/child`. A command that declares `usesRealm()` refuses any other realm, with exit code 1, before it prompts or logs in. That includes the default from `FRODO_REALM`. A part that is `.` or `..`, or that holds a backslash, a control character, `?`, `#` or `%`, makes a realm invalid. The folder of a realm is built with `realmFolderOf` (`/` is `root`, `/parent/child` is `parent/child`).
- **A delete by selector reads a list first.** It finds the object in the list, matches the selector exactly and case-sensitively, and deletes the listed id. The selector is never put into the path of a request ([0037](0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md) still holds: a dry run deletes nothing). An id that is not listed fails the command as above.
- **New code that turns a selector into a path, or a realm into a folder, uses these functions.**

## Consequences

- A file that was named by hand with a character that a pull writes as `%XX` is no longer found by `-i`. `MIGRATION.md` says so, and the message of a missing file names the file that was looked for.
- Every command that declares `usesRealm()` is covered at once by the check in `src/cli/FrodoCommand.ts`. A site that builds a realm folder with its own code is moved to `realmFolderOf` when it is changed.
- `test/unit/ConfigTreePath.test.js` pins the names, `test/unit/ConfigManagerPushHostileSelectors.test.js` the nine push commands, `test/unit/ConfigManagerHostileRealm.test.js` the realm check and `test/unit/FrConfigSecretMappingsDelete.test.js` the delete.
- This record adds a rule and supersedes none.

## Alternatives considered

- **Keep the plain name as a second candidate beside the derived name.** Rejected: the plain name of `a/b` is a path, which is what this record closes.
- **Refuse a selector that is not a name instead of looking for a file.** Rejected: an id may hold any character, and a pull writes it with the same function, so the same id finds the same file.
