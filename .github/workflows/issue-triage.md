---
name: "Concierge 1b Issue Triage"
description: |
  Issue gate triage. Applies internal quality and priority labels.
  Any comment posted for the reporter uses plain language only.
  Skips planning when the issue is marked related-repo.
if: ${{ github.event.issue.state == 'open' && github.event.issue.user.type != 'Bot' }}
on:
  issues:
    types: [labeled]
    names: [issue-worker-ready]
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
      - already-fixed
      - spam
      - backlog
      - low-hanging-fruit
      - out-of-scope
      - scope-review
      - dependency-required
      - issue-triage-handoff
    max: 5
  remove-labels:
    allowed:
      - needs-info
    max: 1
  add-comment:
    max: 1
  close-issue:
    max: 1
  set-issue-type:
    max: 1
  threat-detection:
    enabled: false
max-ai-credits: 8
timeout-minutes: 3
---

## Label application
Apply labels as plain strings. Do not include rationale, confidence, or suggest.
Handoff and classification labels must be applied, not suggested.


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
- Worker says already fixed, and names a later pull request or commit → `already-fixed`, then close the issue
- Worker says the behavior cannot be found, nothing relevant changed after the issue was opened, and the report had enough detail to look for it → `invalid`, then close the issue
- Worker asked for more details before it could decide → `needs-info` (do not emit hand-off, do not close)
- Invalid or spam → corresponding label
- Out of scope: the worker's analysis says the request matches an explicit exclusion in the project's scope file → apply `out-of-scope`, then close the issue with the state reason `NOT_PLANNED`. Do not emit `issue-triage-handoff`.
- Scope unclear: the worker's analysis says a maintainer should look at whether the request fits the project → apply `scope-review`. Do not emit `issue-triage-handoff`, do not close the issue.
- If the issue already has `out-of-scope`, do nothing: it was declined, and a reporter's reply does not change that. If it already shows later-phase progress (`issue-triage-handoff`, `plan-worker-ready`, `plan-triage-handoff`, a `complexity/*` or `risk/*` label, or the coding agent as an assignee), the scope outcomes do not apply: a maintainer or an earlier run decided to plan it. (Earlier gate labels are removed as an issue moves on, so look for any of these.) A maintainer overrides a scope decision by reopening the issue if needed, removing `out-of-scope` or `scope-review`, and adding `issue-triage-handoff`.
- Declares a dependency that has not been cleared (see Dependencies below) → `dependency-required`. Do not emit `issue-triage-handoff`, do not apply `backlog` or `needs-info`, do not close the issue, and do not post a comment about it.
- Valid but not urgent:
  - If the analysis says the change is small in size and low in risk (low complexity and low risk) → low-hanging fruit. Apply `low-hanging-fruit`, then emit `issue-triage-handoff`. Do not apply `backlog`. Both parts must be stated, and only that combination qualifies. If the analysis gives no size or risk, says it could not judge them, or says medium or large size, or medium or high risk, it is not low-hanging fruit.
  - Otherwise → `backlog`.
  - Never apply `backlog` because an analysis ties "not urgent" or "no immediate work planned" to a dependency (see Dependencies below).
- Complete, actionable, and worth doing now → remove `needs-info` if present, then emit `issue-triage-handoff`

Do not emit `issue-triage-handoff` for `already-fixed`, `invalid`, `out-of-scope` or `scope-review`.

## Dependencies
Detect, do not resolve. A separate watcher decides when a dependency is finished.

An issue declares a dependency only with a line that starts with `Depends on:`, `Blocked by:`, or `Requires:`, followed by one or more issue or pull request references (`#N`, `owner/repo#N`, or a GitHub URL). Read the issue body and every comment. A reference in ordinary prose, or after `Fixes`, `Closes`, `Resolves`, or `Reported from`, is not a dependency. Do not infer dependencies from free text.

- No declaration → no dependency gate. Continue as usual.
- A declaration, and the issue has the label `dependency-satisfied` → the watcher or a maintainer has cleared it. Continue as usual. An analysis written while the dependency was pending can say that no work is planned, or that the issue is not urgent, because of that dependency. Disregard that part. Judge the issue as if the dependency were finished, and apply the same checks as for any other issue.
- A declaration, and no `dependency-satisfied` label → apply `dependency-required` and stop here.
- The issue is marked `related-repo` → never gate it.

The needs-info, duplicate, invalid, already-fixed, out-of-scope and scope-review outcomes above take precedence over the dependency gate. An open pull request, or one closed without merging, is never evidence that something is fixed.

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
