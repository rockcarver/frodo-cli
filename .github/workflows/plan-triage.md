---
name: "Concierge 2b Plan Triage"
description: |
  Plan gate triage. Assigns complexity and risk.
  Adds plan-approval-required for high complexity or high risk; does not hand off while that label is present.
  Reads repository-local complexity and risk definitions when present.
if: ${{ github.event.issue.state == 'open' && github.event.issue.user.type != 'Bot' }}
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
The plan is the comment written by `github-actions[bot]` whose body contains the text `gh-aw-workflow-call-id: owner/repo/plan-worker`, where `owner/repo` is this repository. gh-aw appends that text to every comment the plan worker posts, as a hidden HTML comment at the end of the body. The GitHub API returns it in the raw body, so look for the text itself when you read the comments.

Ignore every other comment, including a comment by anyone else that only repeats the text. If no such comment exists, do nothing.

## Classification
Assign exactly one complexity label and one risk label.

Read definitions in this order:
1. `.github/agentic-workflows/complexity.md` (if present)
2. `.github/agentic-workflows/risk.md` (if present)
3. Built-in defaults (low / medium / high as commonly understood for design impact and blast radius)

## Approval gate
If complexity is high, or risk is high, or both:
- Add the label `plan-approval-required`.
- Do **not** emit `plan-triage-handoff`.
- Post a short comment that names the reason and then says how to resume:
  - only complexity is high: "High complexity. Remove the plan-approval-required label to resume."
  - only risk is high: "High risk. Remove the plan-approval-required label to resume."
  - both are high: "High complexity and high risk. Remove the plan-approval-required label to resume."

Otherwise, and unless the issue already carries `plan-approval-required` (see "A hold that is already there") or the plan reports a conflict with a decision record (see "A conflict with a decision record"), emit `plan-triage-handoff`.

You never resume a high-complexity or high-risk issue yourself. When a maintainer removes `plan-approval-required`, a separate workflow (`plan-approval-resume`, no LLM) applies `plan-triage-handoff`.

## A hold that is already there
If the issue already carries `plan-approval-required` when you run (a maintainer added it by hand to see the plan first, or an earlier run added it), classify as usual and apply the complexity and risk labels, but do **not** emit `plan-triage-handoff`, do **not** add `plan-approval-required` again, and post no comment, whatever the classification, even low complexity and low risk. The label is the maintainer's decision, not yours to lift: removing it is the approval, and `plan-approval-resume` hands the issue on.

## A conflict with a decision record
If the plan has a line under a "Decisions that apply" heading that starts with "Conflicts with", the request goes against a decision the repository has taken. Classify as usual and apply the complexity and risk labels, add the label `plan-approval-required` unless the issue already carries it, and do **not** emit `plan-triage-handoff`, whatever the classification. Post this short comment, naming the record number the plan gives, unless the issue already carries `plan-approval-required` (then post no comment, as under "A hold that is already there"): "This conflicts with decision record NNNN. A maintainer has to decide: change the request, or supersede the record. Remove the plan-approval-required label to resume."

You never lift this hold yourself: removing the label is the maintainer's decision, and `plan-approval-resume` hands the issue on.

## Dependency gate
If the issue has the label `dependency-required`, do **not** emit `plan-triage-handoff`, whatever the classification. Say nothing about it in a comment. A watcher removes the label when the work the issue depends on is finished, and the issue then runs through the gates again.
