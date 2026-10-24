---
status: accepted
date: 2026-10-20
decision-makers:
  - maintainers
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# The Repo Concierge runs the issue, plan and PR gates

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Issues need a consistent path from report to merged change: analyse and classify the report, write a plan, hand the work to the coding agent and triage what it produces, with humans in control. Recorded retroactively; both repositories have worked this way since 2026-10-20.

## Decision

- Both repositories run the Repo Concierge (`vscheuber/repo-concierge`): an issue gate (analysis, completeness, scope), a plan gate (a plan comment with complexity and risk labels) and a PR gate (assigning the coding agent, triaging its pull request).
- Each repository pins a Concierge release in `.github/concierge.yml`; a pull-based updater opens a pull request to move the pin.
- A repository does not edit the managed files: the compiled `*.lock.yml` workflows and their `.md` sources, `janitor.yml`, `check-deployment.yml`, `concierge-updater.yml`, `dependency-watch.yml`, `plan-approval-resume.yml`, `pr-ready-signal.yml`, `reporter-notify.yml`, `.github/scripts/` and the pin. It owns `pipeline.yml`, `dependabot*.yml` and `.github/agentic-workflows/` (`scope.md`, `related-repos.md`).
- Gate behaviour is changed in the Concierge repository and released, never patched in a consumer.

## Consequences

- Edits to managed files are overwritten by the next update.
- A gate change reaches every repository that runs the Concierge at once, as update pull requests.
- The human levers in the record "A maintainer stays the last lever on agent work" apply to all gates.
