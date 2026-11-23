---
status: proposed
date: 2026-11-23
decision-makers:
  - maintainers
applies-to:
  - AGENTS.md
  - CLAUDE.md
  - .github/instructions/**
  - .claude/rules/**
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Agent guidance has one source, and per-tool copies are generated from it

## Context and problem statement

[Core 0003](https://github.com/rockcarver/frodo-cli/blob/main/docs/decisions/core/0003-guidance-for-agents-and-contributors-lives-in-the-repository.md) made `AGENTS.md` the entry point, put the rules that matter for part of the code in `.github/instructions/*.instructions.md`, and allowed no other per-tool files. On 2026-11-22 the documentation of Claude Code read none of those instruction files: it loads `AGENTS.md` through the import in `CLAUDE.md`, and scoped rules only from `.claude/rules/`. So a rule for one folder reached GitHub Copilot and not Claude Code, while `AGENTS.md` grew past its short size by carrying rules that matter for a few files, and the laws that are broken most were buried among them.

## Decision

This record replaces core 0003. The one sentence of it that no longer holds is "There are no other per-tool files": generated per-tool copies are allowed, as below. What that record decided still holds: accepted records bind humans and agents, and a pull request that changes a decided behaviour adds or supersedes a record in the same pull request; guidance is public (no credentials, tenant details, incident details or chat transcripts); the Repo Concierge reads the guidance from the default branch; a tool that does not read `AGENTS.md` needs a one-line pointer to it.

- **One source.** A rule that matters for part of the code is written once, as `.github/instructions/<name>.instructions.md` with an `applyTo` list. `AGENTS.md` is the tool-neutral entry point that every session loads.
- **A per-tool copy is allowed when it is generated.** `.claude/rules/` holds one twin of each instruction file, with the same file name, a `paths` list in place of `applyTo` (a name without a slash is anchored at the repository root, because the two tools match it differently), a header that says it is generated, and the body unchanged. A generator writes the whole folder; a test fails when a twin differs from what its source generates, when the sets of names differ, and when a twin has no `paths`. Nobody edits a twin, and a rule that only one tool reads is not allowed.
- **Every generated rule is scoped.** A rule without `paths` loads at launch in every session and costs context each time. A scoped rule does not come back after the context of a session is compacted, so a law that must hold all session is in `AGENTS.md`, not in a rule.
- **`CLAUDE.md` holds only the import of `AGENTS.md`;** nothing else is imported, because an import loads with the file that names it.
- **`AGENTS.md` stays short**, because every session loads it, and the test of the generated rules holds it to a size ceiling. It opens with the few laws that are broken most, each with its reason and the check that catches it. What matters for part of the code goes into a scoped rule.
- **Both repositories keep the same generator** under the name `generate-claude-rules.mjs` (`tools/` in frodo-cli, `scripts/` in frodo-lib), run through an npm script, and the test of it runs with the guidance tests.

## Consequences

- A pull request that changes an instruction file regenerates its twin in the same pull request; the generator with `--check` and the drift test say which file differs.
- A new tool that needs its own copy gets a generator and a drift test like this one, and this record is superseded to name it.
- The generator rejects the glob features that it does not translate (braces, whose commas the `applyTo` list also uses, negation and character classes) instead of passing them on unchecked.
- When this record is accepted, core 0003 is marked `superseded by 0026` in every repository that holds a copy of it, the Homebrew tap among them.
- Whether Claude Code matches a pattern is not provable by a test of ours; it is checked by opening a session on a matching file.
- The two repositories change together: the copies of this record and the generators must stay identical.

## Alternatives considered

A hand-written second set of rules drifts, as core 0003 predicted. An import of every rule into `CLAUDE.md` loads all of them in every session. A link of `.claude/rules/` to `.github/instructions/` cannot translate the two glob dialects and breaks on checkouts without links.
