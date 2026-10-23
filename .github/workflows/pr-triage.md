---
name: "Concierge 3c PR Triage"
description: |
  PR gate triage. Runs when the coding agent signals completion with pr-worker-ready.
on:
  pull_request_target:
    types: [labeled]
if: >-
  github.event.label.name == 'pr-worker-ready'
  && github.event.pull_request.head.repo.id == github.repository_id
checkout: false
# gh-aw's default group for pull-request triggers is one per pull request with cancel-in-progress. Triage's
# own labels (complexity, risk, handoff) each start a run that the `if:` skips, but a skipped run still enters
# the group and cancels the triage that is still finishing (seen on frodo-lib#775: safe_outputs cancelled
# seconds after the labels landed). The label name in the key gives each label event its own group.
concurrency:
  group: gh-aw-${{ github.workflow }}-${{ github.event.pull_request.number }}-${{ github.event.label.name }}
  cancel-in-progress: true
permissions:
  contents: read
  pull-requests: read
  issues: read
  checks: read
  statuses: read
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

Read the pull request's check results and review state if your tools provide them. If a check is failing or still running, say so in the comment and make fixing or awaiting it the recommended next action. Triage classifies size and risk, not whether CI has passed, so still emit `pr-triage-handoff`. If you cannot read the checks, write "CI state not checked". Never infer it.

Emit `pr-triage-handoff` when triage is complete. That label signals that merge rules (branch protection, auto-merge, required reviews) may now act on the final classification.

Post a short comment stating the final labels and the recommended next action.
