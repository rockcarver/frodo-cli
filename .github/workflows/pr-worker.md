---
description: |
  PR gate worker. Assigns a coding agent when plan triage has opened the gate.
  The coding agent must signal completion with the pr-worker-ready label.
if: ${{ github.event.issue.user.type != 'Bot' && !contains(github.event.issue.labels.*.name, 'dependency-required') }}
on:
  issues:
    types: [labeled]
    names: [plan-triage-handoff]
permissions:
  contents: read
  issues: read
  pull-requests: read
safe-outputs:
  add-comment:
    max: 1
  assign-to-agent:
    name: copilot
    max: 1
    target: triggering
    github-token: ${{ secrets.GH_AW_AGENT_TOKEN }}
  threat-detection:
    enabled: false
max-ai-credits: 12
timeout-minutes: 5
engine:
  id: copilot
  model: small
---

# PR Worker

Triggered only when an issue receives `plan-triage-handoff`.
The activation condition already checked everything this workflow depends on, including that the issue is not waiting on a dependency (`dependency-required`). Do not read the issue, its comments or its labels; the instructions below are all you need, and reading untrusted issue content is not part of this job.
Assign the Copilot cloud agent with these instructions:

- Implement the change described in the plan.
- A closing keyword is fine. `Fixes #N` may close the issue on merge. That is expected.
- When the pull request is opened (or updated and ready for review), add the label `pr-worker-ready` to the pull request.
- That label is the signal that the PR triage gate may run.
- Do not reimplement functionality that belongs to a dependency. If a dependency is not available in the version this repository pins, stop and comment on the issue instead of writing code.
- If the repository defines an environment agent, you may request it for test generation.
- Human review is required unless both complexity and risk are low.

Do not write code in this workflow; only route to the coding agent and tell it how to signal completion.
