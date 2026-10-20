---
description: |
  Issue gate triage. Applies quality and priority labels after the issue worker.
  May mark valid but non-urgent issues as backlog instead of handing off to planning.
on:
  issues:
    types: [labeled]
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

Triggered when an issue receives `issue-worker-ready`.
Read the analysis comment produced by the issue worker.

Apply only quality and priority labels.
Do **not** apply complexity or risk labels.

- Missing details → `needs-info`
- Strong duplicate → `duplicate`
- Invalid or spam → corresponding label
- Valid but not urgent (enhancement, low-impact bug, stale but still reasonable) → `backlog`
- Complete, actionable, and worth doing now → `issue-triage-handoff`

`backlog` means the issue is kept but does not enter the plan gate.
`issue-triage-handoff` is the signal that the plan worker may run.

Post at most one short confirmation comment.
