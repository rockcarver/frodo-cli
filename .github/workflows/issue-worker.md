---
description: |
  Issue gate worker. Analyzes completeness and actionability of a new or existing issue.
  Considers age and full comment history for long-lived issues.
on:
  issues:
    types: [opened, reopened, edited]
  workflow_dispatch:
    inputs:
      issue_number:
        description: "Issue number to analyze (leave empty to skip)"
        required: false
        type: string
permissions:
  contents: read
  issues: read
safe-outputs:
  add-comment:
    max: 1
  add-labels:
    allowed:
      - issue-worker-ready
    max: 1
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 8
timeout-minutes: 4
engine: copilot
---

# Issue Worker

## Target issue
- If triggered by an issue event, analyze issue #${{ github.event.issue.number }}.
- If triggered by workflow_dispatch and `issue_number` is provided, analyze that issue.
- Otherwise do nothing.

## Analysis
Read the issue body **and every comment**.
Produce a short analysis comment covering:
- Completeness (reproduction steps, expected vs actual, environment)
- Apparent duplicates
- Whether the report is still actionable
- Age and activity: how long the issue has been open, whether recent comments show continued interest or have gone stale

### Long-lived issues
- If the issue is old, has little recent activity, and is not pressing (no active user impact, no security concern, no broken main path), note that it is a candidate for closure or rejection rather than indefinite retention.
- If it is a valid bug or a reasonable enhancement that is simply not urgent, note that it may belong in the backlog rather than proceeding to a plan immediately.
- Do not invent a roadmap. Base the suggestion only on the issue content, comments, and obvious severity.

If the repository defines an environment agent and a quick reproduction check would help, you may request it. Otherwise proceed without it.

Add the label `issue-worker-ready` when the analysis comment is posted.
