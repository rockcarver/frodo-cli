---
status: accepted
date: 2026-11-10
decision-makers: maintainers
applies-to:
  - src/cli/ResolveInteractiveInputs.ts
  - src/utils/interactive/**
  - test/unit/PathOptionsCoverage.test.js
---

# A path option gets a file system picker where the pass would ask for text

## Context and problem statement

The resolution pass (record 0015) asks for the value of an option as a line of text. For an option that names a file or a folder (`-f, --file`, `-D, --directory`, `-C, --config-folder`) that means typing a path from memory, with no sight of what is there, and a typing mistake only shows later as a failed command. Every other prompt of the pass is a picker. This was decided on 2026-11-10 at the request of the maintainers.

## Decision

- **Where it opens.** The picker replaces the text prompt, and only there: a mandatory path option that is missing, a path option that the user chose in a one-of group, and the value step of the invocation editor (`--prompt`, guided mode). Record 0030 holds: a complete command line, an optional path option that was left out (whatever the command defaults it to), `--no-prompt`, `FRODO_NO_PROMPT` and a run without a terminal open no picker.
- **Which options.** One registry, `src/utils/interactive/PathOptions.ts`, classifies the path options by long name, with overrides per command: a file or a folder, read or written, and optionally the extensions to show. Read or written follows the verb of the command (`export` and `pull` write, every other verb reads) unless the registry says otherwise. A test walks the command tree and fails for an option that takes a value, looks like a path and is neither classified nor listed, with a reason, as not a file system path, and for an entry that matches no option. There is no list of legacy exceptions.
- **What the user does.** The page shows the folder and its sub-folders first, then its files, without hidden (dot) entries unless the registry says the option's usual value is one (an environment file). Enter opens a folder, `..` goes up (there is none at the top of a file system), Enter on a file picks it. A folder is picked with "Use this folder". Where something is written, "New folder…" asks for a name (one name: not empty, not `.` or `..`, no path separator, not one that exists) and makes that one folder, and "New file…" asks for the name of the file. A folder to be read has no "New folder…", because a new folder has nothing in it. A failure, such as an unreadable or read-only folder, is a line on the page, never a thrown error.
- **Where it starts and what it commits.** It starts in the folder of the option's current value if that exists, else in the working directory. The value is relative to the working directory when the path is inside it and absolute otherwise, and the command shown underneath quotes a value that needs it, so that the command shown is the one to type again (record 0019).
- **Escape** makes no selection. For a mandatory option or a one-of group that is the same as declining a text prompt: the command does not run and fails as before. In the editor the option keeps what it had. A double Escape ends the session (record 0018). A folder made on the way stays.
- **Frame and keys.** The picker is drawn as every prompt is (record 0035) and Enter says what it does (record 0043): `open` on a folder, `next` where the pass continues, `commit` in the editor.

## Consequences

- A new command with a path option fails the coverage test until its option is classified or listed, and the picker follows from the classification: the command file declares nothing.
- In the editor the picker opens when the options page is committed, for each path option the user marked there, also one that already holds a value, which it starts from.
- `docs/INTERACTIVE-COMMANDS.md` ("The file system picker") describes the page, its rows and where it opens, and is kept in step with this record.
- Not decided: picking several paths at once, a way to type a path in the picker, and a picker for a path typed outside the pass.

## Alternatives considered

- A picker of every path option the command has, also when the command line is complete: rejected, it prompts for what 4.x accepted (record 0030).
- Deriving the options from their names alone: rejected, a name such as `--path` is sometimes a place inside a configuration and not in the file system, and the verb alone does not say whether a file is read or written.
