---
status: accepted
date: 2026-10-23
decision-makers:
  - maintainers
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# A maintainer stays the last lever on agent work

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Coding agents (GitHub Copilot) and the Repo Concierge gates can label issues, write plans, open pull requests and trigger workflows. That is fast, and the agents can also be wrong or steered by untrusted text in an issue. We want the speed without giving up control over what reaches `main` and what runs with repository secrets.

## Decision

- Agent pull requests are never merged automatically, not even small ones. The only auto-merge in either repository is Dependabot's patch and minor updates, and that workflow is guarded on the Dependabot actor.
- A maintainer approves the workflow runs the coding agent triggers. GitHub holds them until then, which matters because a branch can carry its own workflow files and a run can use repository secrets. Only the run for a pull request's newest commit needs approval; stale and no-op runs are deleted.
- A maintainer can hold an issue before the agent starts: while the `plan-approval-required` label is on an issue the PR gate does not hand it to the coding agent, and removing the label resumes it.
- The Concierge may label, comment and propose. It never merges, approves runs or removes a hold on its own.

## Consequences

- Agent work needs attention: held runs, approvals and reviews are part of the process, not defects.
- A change that would auto-merge agent pull requests, approve agent runs or bypass a hold needs a new record that supersedes this one.
- Contributors and agents should not expect an agent pull request to merge without a human.

## Alternatives considered

Auto-merging low-risk agent pull requests was rejected: the maintainers value the review step as the last lever.
