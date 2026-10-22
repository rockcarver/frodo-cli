---
name: "Concierge 3c PR Triage"
description: |
  PR gate triage. Runs when the coding agent signals completion with pr-worker-ready.
on:
  pull_request:
    types: [labeled]
    names: [pr-worker-ready]
permissions:
  contents: read
  pull-requests: read
  issues: read
safe-outputs:
  add-labels:
    issue-intent: false
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - complexity/low
      - complexity/medium
      - complexity/high
      - risk/low
      - risk/medium
      - risk/high
      - pr-triage-handoff
    max: 3
  add-comment:
    max: 1
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 16
timeout-minutes: 6
engine: copilot
---

## Label application
Apply labels as plain strings. Do not include rationale, confidence, or suggest.
Handoff and classification labels must be applied, not suggested.


# PR Triage

Triggered only when a pull request receives the label `pr-worker-ready`.

Examine the pull request diff.
Re-assign complexity and risk labels based on the actual changes.

Prefer concrete signals:
- Paths touched (auth, security, migrations, public API → raise risk)
- Number of files and size of the diff
- Whether the change matches or exceeds the earlier plan

Emit `pr-triage-handoff` when triage is complete. That label signals that merge rules (branch protection, auto-merge, required reviews) may now act on the final classification.

Post a short comment stating the final labels and the recommended next action.
