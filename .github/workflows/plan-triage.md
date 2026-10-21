---
description: |
  Plan gate triage. Assigns complexity and risk.
  Adds plan-approval-required when human approval is needed; does not hand off while that label is present.
  Reads repository-local complexity and risk definitions when present.
on:
  issues:
    types: [labeled]
    names: [plan-worker-ready]
engine:
  id: copilot
  model: small
max-turns: 8
permissions:
  contents: read
  issues: read
tools:
  bash: false
  cli-proxy: false
  github:
    min-integrity: none
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
      - plan-approval-required
      - plan-triage-handoff
    max: 4
  add-comment:
    max: 1
  threat-detection:
    enabled: false
max-ai-credits: 12
timeout-minutes: 4
---

## Label application
Apply labels as plain strings. Do not include rationale, confidence, or suggest.
Handoff and classification labels must be applied, not suggested.


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
- Do **not** emit `plan-triage-handoff`.
- Post a short comment: "High complexity. Remove the plan-approval-required label to resume."

Otherwise emit `plan-triage-handoff`.

You never resume a high-complexity issue yourself. When a maintainer removes `plan-approval-required`, a separate workflow (`plan-approval-resume`, no LLM) applies `plan-triage-handoff`.

## Dependency gate
If the issue has the label `dependency-required`, do **not** emit `plan-triage-handoff`, whatever the classification. Say nothing about it in a comment. A watcher removes the label when the work the issue depends on is finished, and the issue then runs through the gates again.
