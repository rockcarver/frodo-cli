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

A selector (`-i`, `-n`, `--name`) names one object of a type, and the realm says where it lives. The type, the realm, the id and the working directory (`-D`) are all a command needs to find the object or its file, so none of them has to be a path. Some commands followed a value that was written as a path, and the working directory stopped being the limit of what a command reads or writes. The commands of the configuration group ([0056](0056-the-configuration-command-group.md)) share the selector options of [0057](0057-options-of-the-configuration-commands.md), so one rule has to cover them.

## Decision

- **A selector is an id or a name, never a path.** The commands that find a file or a folder from a selector, and `delete secret-mappings`, treat it so, by the rules below.
- **The file or folder of an object is derived from its id or name** by `src/utils/ConfigTreePath.ts`: a character that a file name cannot hold is written as `%XX` (`/` is `%2F`) and the name is cut to what a file name can hold. `oauth-issuers`, `oauth-cimd-profiles` and `oauth-software-publishers` use only that name. The other commands that find a file from a selector find a name that is one safe segment (no `/` or `\`, not `.` or `..`, no control character) by its plain name as before, and look up any other value by the derived name. The result must lie inside the folder of the type, and the folder of an object is never the folder of the type itself.
- **A value that does not lead to a file is a name that no file has.** The named-object failure of [0041](0041-the-config-manager-plain-form-is-what-an-unattended-pipeline-needs.md) applies: exit code 1, whatever `--allow-failures` says, and the command says that no such file was found (or, for `..` and `.`, that the value does not name an object).
- **A realm is `/`, a name or a path of names** such as `/parent/child`. A command that declares `usesRealm()` refuses any other realm, with exit code 1, before it prompts or logs in. That includes the default from `FRODO_REALM`. A part that is `.` or `..`, or that holds a backslash, a control character, `?`, `#` or `%`, makes a realm invalid. The folder of a realm is built with `realmFolderOf` (`/` is `root`, `/parent/child` is `parent/child`).
- **`delete secret-mappings -i` checks the id against the list of the realm.** It reads the list first, matches the id exactly and case-sensitively, and deletes the listed id; the id is not used as typed ([0037](0037-a-command-that-can-delete-more-than-the-one-object-it-names-asks-first.md) still holds: a dry run deletes nothing). An id that is not listed fails the command as above.
- **New code that turns a selector into a path, or a realm into a folder, uses these functions.**

## Consequences

- A file that was named by hand with a character that is written as `%XX` is no longer found by `-i` of the three agent types, and a name with a `/` is looked up by the derived name, not as a path, on the other commands. `MIGRATION.md` says so.
- Every command that declares `usesRealm()` is covered at once by the check in `src/cli/FrodoCommand.ts`. A site that builds a realm folder with its own code is moved to `realmFolderOf` when it is changed.
- Commands that this change did not touch are brought under the rule when they are changed.
- `test/unit/ConfigTreePath.test.js` pins the names, `test/unit/ConfigManagerPushHostileSelectors.test.js` the push commands, `test/unit/ConfigManagerHostileRealm.test.js` the realm check and `test/unit/FrConfigSecretMappingsDelete.test.js` the delete.
- This record adds a rule and supersedes none.

## Alternatives considered

- **Keep the plain name as a second candidate beside the derived name.** Rejected: the plain name of `a/b` is a path, which is what this record closes.
- **Refuse a selector that is not a name instead of looking for a file.** Rejected: an id may hold any character, so the file name of an id is derived from it by one function.
