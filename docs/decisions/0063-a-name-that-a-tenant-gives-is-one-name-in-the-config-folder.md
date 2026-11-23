---
status: proposed
date: 2026-11-23
decision-makers: maintainers
applies-to:
  - src/utils/ConfigTreePath.ts
  - src/utils/Config.ts
  - src/utils/OperationRun.ts
  - src/configManagerOps/**
  - src/ops/ApplicationConfigOps.ts
  - src/ops/ApplicationMigrateOps.ts
  - src/ops/ConfigManagerAgentKind.ts
  - src/ops/RemoteProxyOps.ts
issues:
  - rockcarver/frodo-cli#1264
  - rockcarver/frodo-cli#1365
---

# A name that a tenant gives is one name in the config folder

## Context and problem statement

A pull names the files and folders it writes after what the tenant answers: the realm, the name or the id of an object, and the keys inside an object. [A selector is an id or a name, never a path](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0059-a-selector-is-an-id-or-a-name-never-a-path.md) already holds for what a person types, and [a file reference must stay inside the config folder](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0061-a-file-reference-must-stay-inside-the-config-folder.md) for what a push reads. The names that a pull writes were joined to a path as they came, in about fifty places, so one rule had to cover all of them. The library creates the folders of a path before a file is written, and it rewrites a path (a backslash is a slash, every `C:` goes), so a path has to be refused before it is handed over.

## Decision

- **Every file that a pull writes or removes passes one gate** (`pulledFilePath` in `src/utils/ConfigTreePath.ts`) before the library sees its path. The gate refuses a path that is empty or absolute, has `..` as a segment, holds a backslash, a control character or `C:`, or has a name of more than 255 bytes. A test reads the source and fails a write that does not pass it.
- **A name, an id or a key that becomes a file or a folder is one name.** `nameInFolder` (and `nameInStem` where a file refers to the file) gives the name as it is when it is one safe name, and the file name of an id otherwise: a character of a path is written as `%XX` (`a/b` is `a%2Fb`). A name that is a name already is written as before, byte for byte, and the `file` reference inside a file is the text of the name of that file.
- **A value that leaves no name is a failure of its object.** `.`, `..`, an empty name, a name of more than 255 bytes (it is not cut), a realm that is not `/`, a name or a path of names, and a file that is the same file as another one of the pull on a file system that ignores case or Unicode form (the later one) are not pulled. The reason is printed, the object is named in the summary of [the run](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/0040-a-command-that-runs-many-operations-runs-them-all-then-fails-if-any-failed.md), the other objects are written, and the exit code is 1 unless `--allow-failures` allows it.
- **Exceptions.** A raw path is a path by design: it passes the gate and nothing else. The names that Windows reserves or trims are not changed. A link of the file system inside the config folder is not followed.
- **New code that writes a file from what a tenant or a file names uses these functions**, and a new write goes through the gate.

## Consequences

- A name with a `/` is one file or folder, which a push finds by the name `-i` looks for. A tree that an older pull wrote is not moved: the old nested folder is deleted by hand. `MIGRATION.md` says so.
- Two objects that differ only in case or Unicode form fail on Linux too, where they used to work, and a script or a workflow that has no file name is not pulled.
- `test/unit/ConfigManagerPullWriteSites.test.js` fails an ungated write, `test/unit/ConfigManagerPullHostileNames.test.js` runs every family of pull against hostile names, `test/unit/ConfigManagerPullRoundTrip.test.js` pushes what was pulled and `test/unit/ConfigManagerPullHostileFakeTenant.test.js` runs the real command.
- Not covered: links of the file system, the names that a push reads from a directory listing, and the copy of the name functions that the library keeps.
- This record adds a rule and supersedes none.

## Alternatives considered

- **Refuse every name that is not one safe name.** Rejected: a theme or a policy named `Login/SSO` would fail its whole pull, and a name that holds a `/` was never found by a push.
- **A writer in the CLI that every file goes through.** Rejected for now: many tests replace the writer functions of the library, and the gate in front of the path is the one place a later check of links attaches to.
