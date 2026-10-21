---
description: |
  Issue gate worker. Analyzes completeness and actionability.
  Guides reporters only through comments; never mentions internal labels.
  Prefers the repository issue template as the definition of a complete issue.
  For split-repo projects, creates a linked canonical issue and marks the original with related-repo.
on:
  issues:
    types: [opened, reopened, edited]
  issue_comment:
    types: [created]
  workflow_dispatch:
    inputs:
      issue_number:
        description: "Issue number to analyze (leave empty to skip)"
        required: false
        type: string
concurrency:
  job-discriminator: ${{ github.run_id }}
user-rate-limit:
  max-runs-per-window: 3
  window: 30
  events: [issue_comment]
engine:
  id: copilot
  model: small
max-turns: 10
permissions:
  contents: read
  issues: read
tools:
  bash: false
  cli-proxy: false
  github:
    min-integrity: none
safe-outputs:
  add-comment:
    max: 2
    target: "*"
  add-labels:
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - issue-worker-ready
      - related-repo
    max: 2
    target: "*"
  create-issue:
    max: 1
    allowed-repos: ["rockcarver/frodo-lib"]
    github-token: ${{ secrets.FRODO_LIB_ISSUES_TOKEN }}
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 16
timeout-minutes: 5
---

# Issue Worker

## Target issue
- Issue event → analyze issue #${{ github.event.issue.number }}.
- Comment event → analyze the issue the comment belongs to (ignore bot comments).
- workflow_dispatch → analyze issue #${{ github.event.inputs.issue_number }}.
  If that value is empty, do nothing.
  On this trigger there is no triggering item, so pass that issue number
  explicitly to add-comment and add-labels.
- Otherwise do nothing.

## Completeness criteria
Determine what makes an issue meaningful by reading, in order:

1. `.github/agentic-workflows/issue-completeness.md` (if present)
2. Issue templates under `.github/ISSUE_TEMPLATE/` or `.github/ISSUE_TEMPLATE.md`
3. Generic fallback: reproduction steps, expected vs actual behavior, environment

## Related repositories (linked-issue flow)
If `.github/agentic-workflows/related-repos.md` exists, read it.

When the current issue clearly belongs in a related repository (per the `when` text):

The `secret` field on that entry names the Actions secret the workflow uses to create the issue. You do not use the secret. You only create the issue in the related repository.

1. Create a new issue in that related repository (the canonical issue) via the create-issue safe-output.
   - Title: same as the original, or a clear summary.
   - Body: include the original report and a line `Reported from {owner}/{repo}#{number}`.
2. On the original (non-canonical) issue:
   - Post a plain-language comment.
     If the related entry has `release.requires_consumer_release: true`:
     "This is being tracked in {owner}/{repo}#{number}. A release of this project that includes that fix will be needed before this is resolved."
     Otherwise:
     "This is being tracked in {owner}/{repo}#{number}. We will update this issue when that work is finished."
   - Add the internal label `related-repo`.
   - Do **not** add `issue-worker-ready`.
3. On the new canonical issue, post a short comment: "Opened from {owner}/{repo}#{number}."

The original issue stays open. It will be closed only after the canonical issue is implemented and closed.

If a link already exists (comment already points at a canonical issue, or `related-repo` is present), do not create another issue. Just ensure the comment and label are in place.

If the issue belongs in this repository, continue with the normal analysis below.

## Analysis comment (reporter-facing)
Read the issue body **and every comment**.
Post a short, plain-language comment. Do not mention labels, gates, workflows, or any internal harness terms.

Cover, in ordinary language:
- Whether the report is clear enough to act on
- Apparent duplicates
- Whether the reported behavior is already fixed, or cannot be found in the current code

### Already fixed or cannot reproduce
Use the issue's creation date as the line.

1. From the report, name the files or subsystem that would have to change.
2. Look at commits and merged pull requests that touch those files after the issue was opened.
3. Read the current code for the reported behavior.

Then say one of these, plainly:

- Already fixed: a change after the issue date addresses the reported behavior. Name the pull request or commit. This is not a guess. If you cannot point at that later change, do not call it fixed.
- Cannot reproduce: the current code does not show the reported behavior, and nothing relevant changed after the issue was opened. Do not call this fixed.
  Only say this when the report is complete enough to look for. If reproduction steps, environment, or the expected behavior are missing, ask for those details instead. Do not call an incomplete report invalid.
- Still present: the current code still matches the report. Continue as usual.

Do not use age or inactivity as a reason to call an issue fixed.

### Missing information
If required details are absent and the issue belongs here, end with a direct request that lists only the items still needed.

### Not urgent
If it is valid but not urgent, say that it has been noted for later and that no immediate work is planned.

If the repository defines an environment agent and a quick reproduction check would help, you may request it. Otherwise proceed without it.

## Signaling (internal)
- If the issue stays here: add `issue-worker-ready`.
- If you created or confirmed a linked canonical issue: add `related-repo` and do **not** add `issue-worker-ready`.
