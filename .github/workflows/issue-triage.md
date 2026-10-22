---
description: |
  Issue gate triage. Applies internal quality and priority labels.
  Any comment posted for the reporter uses plain language only.
  Skips planning when the issue is marked related-repo.
if: ${{ github.event.issue.user.type != 'Bot' }}
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
- Declares a dependency that has not been cleared (see Dependencies below) → `dependency-required`. Do not emit `issue-triage-handoff`, do not apply `backlog` or `needs-info`, do not close the issue, and do not post a comment about it.
- Valid but not urgent → `backlog`
- Complete, actionable, and worth doing now → remove `needs-info` if present, then emit `issue-triage-handoff`

Do not emit `issue-triage-handoff` for `already-fixed` or `invalid`.

## Dependencies
Detect, do not resolve. A separate watcher decides when a dependency is finished.

An issue declares a dependency only with a line that starts with `Depends on:`, `Blocked by:`, or `Requires:`, followed by one or more issue or pull request references (`#N`, `owner/repo#N`, or a GitHub URL). Read the issue body and every comment. A reference in ordinary prose, or after `Fixes`, `Closes`, `Resolves`, or `Reported from`, is not a dependency. Do not infer dependencies from free text.

- No declaration → no dependency gate. Continue as usual.
- A declaration, and the issue has the label `dependency-satisfied` → the watcher or a maintainer has cleared it. Continue as usual.
- A declaration, and no `dependency-satisfied` label → apply `dependency-required` and stop here.
- The issue is marked `related-repo` → never gate it.

The needs-info, duplicate, invalid, and already-fixed outcomes above take precedence over the dependency gate. An open pull request, or one closed without merging, is never evidence that something is fixed.

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
