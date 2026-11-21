---
status: proposed
date: 2026-11-20
decision-makers: maintainers
applies-to:
  - src/utils/ConfigTreePath.ts
  - src/configManagerOps/**
  - src/ops/ApplicationConfigOps.ts
issues:
  - rockcarver/frodo-cli#1264
  - rockcarver/frodo-cli#1365
---

# A file reference must stay inside the config folder

## Context and problem statement

A file of a configuration tree can refer to another file: the `file` of a script, of a field of a theme, of an email template, of a mapping, of a schedule, of an endpoint or of a workflow step (pull writes `scripts-content/<context>/<name>.js` and the like). A push reads the file that the reference names and sends its text. Other values in a file of the tree name a file too: the id of a script in a journey node, the id of a circle of trust, the id of a mapping that an application owns, the version and the language of terms and conditions. The config folder is meant to be the only place a push reads from, and [a selector is an id or a name, never a path](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md) already holds that for the command line. When this was decided, on 2026-11-20, the older import commands that follow `file://` references were not covered by either rule.

## Decision

- **A file reference names a file inside the folder it is joined to.** `referencedFilePath(folder, reference)` in `src/utils/ConfigTreePath.ts` joins the reference to the folder it is relative to (the folder of the object, of the step, of the template) and throws `The file reference '<reference>' must stay inside the config folder.` when the file would not be inside it. Refused: a reference that goes above the folder (`..`, `../x`, `a/../../x`), the folder itself, an empty reference, an absolute path (`/x`), a reference that starts with a drive letter (`C:\x`, `a:b.js`), one that holds `C:` anywhere (`..C:/x`, `ABC:x`), one that holds a control character, and a value that is not text (a number as the `version` of terms and conditions is such a value). A name that only holds two dots (`a..b.js`, `..foo.js`) is a name, and any other colon (`sub/a:b.js`, `Login:SSO.onCreate.js`) is an ordinary character. A reference that starts with a letter and a colon is a drive letter, so a name such as `a:b` does not round-trip as a reference inside a file.
- **The test judges the path the way the library will read it.** The library rewrites a path after it is built: it reads `\` as `/` and removes every `C:` (upper case), and nothing else. So `..C:/x` would be `../x`. The test is made on the reference with `\` read as `/`, so a backslash separates on every platform, and `C:` is refused anywhere, so that no rewrite can change the verdict.
- **A name, an id or a part of a realm is one name**: not empty, not `.` or `..`, and with no `/`, no `\`, no control character and no `C:`. `isOneSafeSegment` and `realmFolderOf` refuse anything else for the same reason. A file or a folder for such a name or id is the file name of an id, which writes a colon as `%3A`, and a realm that is not one name is refused like any realm that is not a name or a path of names. Any other colon (`Login:SSO`, `urn:x:y`) is an ordinary character: a pull writes such a name as it is and a push finds it.
- **The rule is pinned by a test, not by this text.** `test/unit/ConfigTreePath.test.js` puts a systematic corpus of strings through the helpers and, for everything a helper accepts, through the real `getFilePath` of the library with a folder as the working directory: the library must read the path as the helper built it, inside the folder. A library that rewrites more shows up when it is pinned.
- **The test is on the text of the path.** It looks at no file and follows no link of the file system: a link inside the folder that points elsewhere is not caught, and a check of the real path of the whole tree is a separate decision.
- **The check comes before the file is looked at, and a refused reference ends like a file that cannot be read**: the object is not sent, the command says which reference, runs the other objects of a bulk run and names the failed one in the summary ([run all, then fail](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md)), exits with 1 ([code sets the exit code](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0033-code-sets-the-exit-code-and-returns-instead-of-exiting.md)), and `--allow-failures` acts as for an unreadable file. Where a missing file is skipped (a mapping, a managed object, a workflow step), it stays skipped; only a reference that is refused is not skipped.
- **An id that a file of the tree gives as the name of another object is a name, never a path.** The file or folder is derived with `objectFilePath` and `objectFolderPath`, as for a selector. The version of terms and conditions is a reference to a folder of the terms, and the language a reference to a file of that folder.
- **New code that reads a file named by a value found in a file of the tree uses these functions, and tests them with the `getFilePath` of the library, not a copy of it.**

## Consequences

- A reference that goes up out of its folder is not read, also when the file it names is still in the tree (`../shared.js`); neither is an absolute one, one that starts with a drive letter or one that holds `C:`. A circle of trust, a policy set or an agent whose id holds `C:`, and a realm that holds `C:`, are skipped with the warning that a name which is not one name already has (a realm named on the command line is refused). What pull writes is otherwise unchanged. `MIGRATION.md` says so.
- `test/unit/ConfigTreePath.test.js` pins the helper, `test/unit/ConfigManagerFileReferences.test.js` each place that reads a reference or such an id, `test/unit/ConfigManagerFileReferenceSites.test.js` fails when a read of a `file` skips the helper, and `test/unit/ConfigManagerFileReferencesFakeTenant.test.js` runs the commands against a fake tenant.
- Not covered: links of the file system, the names that a push reads from a directory listing, and the older import commands that follow `file://` references. They are separate changes.
- This record adds a rule and supersedes none.

## Alternatives considered

- **The whole working directory as the folder.** Rejected: a reference that goes up and stays in the tree would be read, and the helper would need a second path for every call.
- **A backslash that separates only on some platforms.** Rejected: the same reference would name different files on different systems.
