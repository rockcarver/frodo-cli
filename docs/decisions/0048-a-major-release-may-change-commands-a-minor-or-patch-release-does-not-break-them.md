---
status: accepted
date: 2026-11-10
decision-makers: maintainers
---

# A major release may change commands; a minor or patch release does not break them

## Context and problem statement

The records on the interactive prompting framework (0030 and 0034, superseded by 0047) were quoted whenever a command was to change, as if a command line had to keep working from one major version to the next. They never said that, and it was not meant: a major release is where commands are reshaped. With no rule that says so, reviewers, agents and automated gates look for one and find the prompting records. This record says what a release of each kind may change. It carries over the rule of record 0034 that a fix for a defect is not a break, in the form that applies to a minor or patch release.

## Decision

- **A major release may change, rename or remove a command, an option, an alias or an output** relative to the previous major release. No record, and no rule about what the previous major release did, binds such a change, unless a record says so explicitly and names the behaviour.
- **Every change a user can see is listed in `MIGRATION.md`** in the pull request that makes it: a removal, a rename, a changed meaning, or changed output that scripts read. The entry says what changed, from which release, and what to use instead.
- **Prereleases of a major release** (for example `x.0.0-n`) belong to that major release's development. A change between them is not a break, but it is listed in `MIGRATION.md` once when it is a change relative to the previous major release.
- **A minor or patch release does not break the commands of its major release,** except to fix a defect: behaviour that contradicts the command's own help or declaration, or that produces a result no valid input could mean (a credential set to `true`, a conflict that names no option). The pull request of a fix names the defect and its evidence, and lists the change in `MIGRATION.md` when a user can see the difference.
- **A maintainer decides in the pull request** whether a change is a break or a fix. A contributor or an agent who is unsure says so there. They do not refuse a change because an earlier release behaved differently.
- **Experimental features stay outside the minor and patch rule** ([core 0019](core/0019-experimental-features-are-not-bound-by-compatibility-records.md)).

## Consequences

- When a change breaks an old command line, reviewers, agents and gates cite this record, not the record on the prompting framework (0047).
- `AGENTS.md` and `MIGRATION.md` point to this record.
- Not decided: whether a given change is a break or a fix. That is judged in each pull request, with the evidence above.

## Alternatives considered

- Leave the question to the prompting records: they are about prompts, and they have been read as a promise that no command changes.
- Keep every old command line working across major releases: nothing could be renamed or removed, and each change would need its own exception, as records 0032 and 0037 needed one.
- Decide in each pull request without a record: the next contributor meets the same question.
