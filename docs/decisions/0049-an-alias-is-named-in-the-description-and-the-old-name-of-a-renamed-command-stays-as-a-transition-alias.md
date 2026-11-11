---
status: proposed
date: 2026-11-11
decision-makers: maintainers
applies-to:
  - src/cli/**
issues:
  - rockcarver/frodo-cli#1273
---

# An alias is named in the description, and the old name of a renamed command stays as a transition alias

## Context and problem statement

The help wrote an alias into the name of a command (`conn save|add`). A list that should teach one name showed two, only the first of several aliases appeared, and a long pair widened the name column of the whole list. A rename had no way to keep the old name working and tell users the new one. On 2026-11-11 one command had an alias and none was the old name of a renamed command; renames of whole families of commands were planned.

## Decision

- **An alias is added with `withAlias(name, kind)`, never with `.alias()`**; lint rejects the plain call in `src/cli/`. The kind is `convenience` (the default: a second spelling that stays) or `transition` (the old name of a renamed command).
- **The help names the preferred name only,** in the list of commands and in the usage line. The description ends with the alias in one fixed form, `(alias: a)`, `(aliases: a, b)` or `(formerly: old)`, which `/\((alias(es)?|formerly): [^)]+\)$/` reads. The note is the same in a list row and on the command's own page, at every help level. The interactive picker shows no alias.
- **A rename keeps the old name as a transition alias.** The old name keeps working until a major release removes it ([0048](0048-a-major-release-may-change-commands-a-minor-or-patch-release-does-not-break-them.md)), and the rename is listed in `MIGRATION.md`. An experimental feature may rename without the alias ([core 0019](core/0019-experimental-features-are-not-bound-by-compatibility-records.md)).
- **Typing a transition alias prints one notice on stderr, once per run:** `'old' is now called 'new'. The old name still works and will be removed in a future major release.` Stdout and the exit code do not change. Typing the new name or a convenience alias prints nothing. No option or environment variable silences the notice.

## Consequences

- `test/unit/CommandAliases.test.js` fails for an alias added another way, for a name in a list row or usage line that carries an alias, and for a note that does not match the form.
- `docs/CONTRIBUTE.md`, `.github/instructions/cli-commands.instructions.md`, the `add-a-cli-command` skill and the maintenance steps of `MIGRATION.md` name `withAlias`.
- A note can wrap onto a second line of the description column; read it joined.
- Not decided: when a given transition alias is removed (the first major release that wants to), or whether many `(formerly: ...)` notes in one list should be shortened.

## Alternatives considered

- Keep `name|alias` in the name: it teaches two names, shows only the first alias and cannot say that an alias is the old name.
- Hide transition aliases from the lists and show them at higher help levels: the list is where a user would learn the new name.
- Register the old name as a hidden second command: every rename would need its own usage examples and help snapshot, and the generic stability warning cannot name the new command.
- An option or environment variable that silences the notice: left out until a script needs one.
