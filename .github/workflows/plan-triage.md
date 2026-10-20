---
description: |
  Plan gate triage. Assigns complexity and risk.
  Adds plan-approval-required when human approval is needed; does not hand off while that label is present.
  Reads repository-local complexity and risk definitions when present.
on:
  issues:
    types: [labeled]
    names: [plan-worker-ready]
permissions:
  contents: read
  issues: read
safe-outputs:
  add-labels:
    allowed:
      - complexity/low
      - complexity/medium
      - complexity/high
      - risk/low
      - risk/medium
      - risk/high
      - plan-approval-required
      - plan-triage-handoff
    max: 4
  add-comment:
    max: 1
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 8
timeout-minutes: 4
engine: copilot
---

# Plan Triage

Triggered only when an issue receives `plan-worker-ready`.

## Which comment is the plan
Locate the comment that contains the exact marker:

```html
<!-- gh-aw-workflow-id: plan-worker -->
```

Ignore every other comment. If no such comment exists, do nothing.

## Classification
Assign exactly one complexity label and one risk label.

Read definitions in this order:
1. `.github/agentic-workflows/complexity.md` (if present)
2. `.github/agentic-workflows/risk.md` (if present)
3. Built-in defaults (low / medium / high as commonly understood for design impact and blast radius)

## Approval gate
If complexity is high:
- Add the label `plan-approval-required`.
- Do **not** emit `plan-triage-handoff` while that label is present.
- Post a short comment: "High complexity. Remove the plan-approval-required label to resume."

If `plan-approval-required` is absent (or has been removed by a human):
- Emit `plan-triage-handoff`.

The presence of `plan-approval-required` blocks the PR gate. Removing it is the human signal to continue.
