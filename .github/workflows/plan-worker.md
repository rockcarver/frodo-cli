---
description: |
  Plan gate worker. Produces a short, cheap, rough plan used only for classification.
  The plan comment is uniquely identified by the gh-aw-workflow-id marker.
on:
  issues:
    types: [labeled]
    names: [issue-triage-handoff]
permissions:
  contents: read
  issues: read
safe-outputs:
  add-comment:
    max: 1
  add-labels:
    allowed:
      - plan-worker-ready
    max: 1
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 20
timeout-minutes: 6
engine: copilot
---

# Plan Worker

Triggered only when an issue receives `issue-triage-handoff`.
Produce a short, rough plan only. No code.
This plan exists so plan triage can assign complexity and risk. It is not a collaborative design document.

## Plan contents
- Expected files or subsystems to touch
- Rough size (small / medium / large)
- Notable risk signals (auth, data, public API, migrations, etc.)
- Whether a design discussion is likely needed
- Open questions, if any

If the repository defines an environment agent and a quick check would improve the plan, you may request it. Otherwise proceed without it.

## Identity of the plan comment
gh-aw automatically appends a hidden marker to every comment this workflow creates:

```html
<!-- gh-aw-workflow-id: plan-worker -->
```

Do not try to add this marker yourself. The safe-outputs job inserts it.
That marker is the unique, non-spoofable signature of the plan comment.

Post the plan as a single comment and add the label `plan-worker-ready`.
