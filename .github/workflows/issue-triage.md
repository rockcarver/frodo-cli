---
description: |
  Issue gate triage. Applies internal quality and priority labels.
  Any comment posted for the reporter uses plain language only.
  Skips planning when the issue is marked related-repo.
on:
  issues:
    types: [labeled]
    names: [issue-worker-ready]
permissions:
  contents: read
  issues: read
safe-outputs:
  add-labels:
    allowed:
      - bug
      - feature
      - question
      - documentation
      - needs-info
      - priority/p0
      - priority/p1
      - priority/p2
      - duplicate
      - invalid
      - spam
      - backlog
      - issue-triage-handoff
    max: 5
  remove-labels:
    allowed:
      - needs-info
    max: 1
  add-comment:
    max: 1
  set-issue-type:
    max: 1
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 6
timeout-minutes: 3
engine: copilot
---

# Issue Triage

Triggered only when an issue receives `issue-worker-ready`.
Read the latest analysis comment produced by the issue worker.

## Related-repo issues
If the issue already has the label `related-repo`, do nothing.
It is a non-canonical pointer; planning happens only on the linked canonical issue.

## Internal labels (never mentioned to the reporter)
Apply only quality and priority labels. Do **not** apply complexity or risk labels.

- Missing details → `needs-info` (do not emit hand-off)
- Strong duplicate → `duplicate`
- Invalid or spam → corresponding label
- Valid but not urgent → `backlog`
- Complete, actionable, and worth doing now → remove `needs-info` if present, then emit `issue-triage-handoff`

`backlog` keeps the issue open but does not enter the plan gate.
`issue-triage-handoff` is the signal that the plan worker may run.

## Reporter-facing comment
If you post a comment, use plain language only.
Do not mention labels, gates, workflows, or harness terms.
Examples:
- "Thanks, this is clear enough to look at."
- "Still need the reproduction steps before we can proceed."
- "Noted for later; no immediate work planned."

A reporter reply re-triggers the issue worker, which re-applies `issue-worker-ready`. This triage then runs again and can clear `needs-info` and hand off once the issue is complete.
