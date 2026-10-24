---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
issues:
  - rockcarver/frodo-cli#889
  - rockcarver/frodo-lib#786
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
  - rockcarver/homebrew-frodo-cli
  - rockcarver/frodo
---

# Guidance for agents and contributors lives in the repository

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Contributors and agents use many different tools (Claude Code, GitHub Copilot, Grok, others). Conventions and design intent lived in people's heads and personal notes, so an agent could rebuild something the maintainers had deliberately designed differently. Recorded on the day the convention was introduced.

## Decision

- `AGENTS.md` at the repository root is the single, tool-neutral entry point: commands, hard rules, where things live and a "Decisions" section. Rules that matter for part of the code live in `.github/instructions/*.instructions.md` with `applyTo` globs.
- A root `CLAUDE.md` contains only `@AGENTS.md`. There are no other per-tool files.
- Decision records (`docs/decisions/`, in frodo-lib `decisions/`) are binding for humans and agents until superseded. Decisions that span repositories live here, in the umbrella repository, and each repository's `AGENTS.md` lists the ones that bind it.
- Guidance and records are public. Credentials, tenant details, security-incident details, personal preferences and chat transcripts do not go into the repositories.
- The Repo Concierge's plan and PR gates read this guidance from the default branch.

## Consequences

- Keep `AGENTS.md` short (about 60 lines): it is loaded into every agent run and costs credits.
- A pull request that changes a decided behaviour adds or supersedes a record in the same pull request.
- A tool that does not read `AGENTS.md` needs a one-line pointer to it.

## Alternatives considered

Per-tool instruction files drift apart. A private repository for decisions would hide them from contributors and from the coding agent.
