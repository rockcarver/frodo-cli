---
description: |
  PR gate worker. Assigns a coding agent when plan triage has opened the gate.
  The coding agent must signal completion with the pr-worker-ready label.
on:
  issues:
    types: [labeled]
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
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 10
timeout-minutes: 5
engine: copilot
---

# PR Worker

Triggered when an issue receives `plan-triage-handoff`.
Assign the Copilot cloud agent with these instructions:

- Implement the change described in the plan.
- When the pull request is opened (or updated and ready for review), add the label `pr-worker-ready` to the pull request.
- That label is the signal that the PR triage gate may run.
- If the repository defines an environment agent, you may request it for test generation.
- Human review is required unless both complexity and risk are low.

Do not write code in this workflow; only route to the coding agent and tell it how to signal completion.
