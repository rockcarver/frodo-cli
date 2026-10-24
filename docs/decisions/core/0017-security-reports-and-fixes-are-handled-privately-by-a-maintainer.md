---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - SECURITY.md
  - .claude/skills/triage-a-security-report/**
repos:
  - rockcarver/frodo
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
  - rockcarver/homebrew-frodo-cli
---

# Security reports and fixes are handled privately by a maintainer

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

The repositories receive unsolicited security reports and fix pull requests from outside, some produced by automated scanners. None of them published a way to report privately, so reporters defaulted to public pull requests. A scanner's description tends to overstate the threat model (it treats a setting chosen by the person who runs the tool as attacker input), and its fix can be incomplete. A pull request that claims to be a security fix is also an easy way to slip in a malicious change. Reports that reach the public issue gates could be picked up by coding agents without a maintainer noticing.

## Decision

- Each repository publishes a `SECURITY.md` and enables GitHub private vulnerability reporting. Suspected vulnerabilities are reported there, never in public issues or pull requests.
- A maintainer owns every security report and every unsolicited security fix. Coding agents and the Repo Concierge do not act on them: no assignment, no plan, no pull request.
- The threat model is stated per repository in `SECURITY.md`. The operator who runs the CLI, the library or the MCP server, and their command line, environment, connection profiles and files, are trusted. A report has to show an attacker who controls an input without already controlling those.
- An unsolicited fix pull request is read in full before any CI run is approved or any dependency is installed. Workflow, package manifest, lockfile and script changes are checked first.
- A fix from an automated scanner is never merged on the strength of its description. The claim is reproduced on `main`, the origin of the input is traced, and the fix is probed for bypasses and must have tests. Hardening that is not an exploitable vulnerability is tracked as a normal backlog item, and the pull request is closed with an explanation.
- A confirmed vulnerability is fixed through a private advisory (a private fork or branch), released, and then disclosed. Exploit details do not appear in a public place before the fix is released.
- The procedure lives in the `triage-a-security-report` skill of each code repository.

## Consequences

- Reporters get one clear channel, and scanner noise is closed quickly with a reason.
- Maintainers have to watch the private channel. The policy promises no response times: the projects are volunteer-maintained and respond on a best-effort basis.
- A real report is never discussed in public before a fix exists, which also means the public history of a fix may lag its private discussion.

## Alternatives considered

- **Contact by email only:** rejected, because it puts a personal address in a public file and has no private place to build a fix.
- **Accept and merge scanner pull requests:** rejected, because they are unverified and a supply-chain risk.
- **Ignore unsolicited reports:** rejected, because real reports get lost with the noise.
