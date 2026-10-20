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
  skip-if-match: "label:related-repo OR label:duplicate OR label:spam"
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
safe-outputs:
  add-comment:
    max: 2
  add-labels:
    allowed:
      - issue-worker-ready
      - related-repo
    max: 2
  create-issue:
    max: 1
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
- workflow_dispatch with `issue_number` → analyze that issue.
- Otherwise do nothing.

## Completeness criteria
Determine what makes an issue meaningful by reading, in order:

1. `.github/agentic-workflows/issue-completeness.md` (if present)
2. Issue templates under `.github/ISSUE_TEMPLATE/` or `.github/ISSUE_TEMPLATE.md`
3. Generic fallback: reproduction steps, expected vs actual behavior, environment

## Related repositories (linked-issue flow)
If `.github/agentic-workflows/related-repos.md` exists, read it.

When the current issue clearly belongs in a related repository (per the `when` text):

1. Create a new issue in that related repository (the canonical issue) via the create-issue safe-output.
   - Title: same as the original, or a clear summary.
   - Body: include the original report and a line `Reported from {owner}/{repo}#{number}`.
2. On the original (non-canonical) issue:
   - Post a plain-language comment: "This is being tracked in {owner}/{repo}#{number}. We will update this issue when that work is finished."
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
- Age and recent activity if relevant

### Missing information
If required details are absent and the issue belongs here, end with a direct request that lists only the items still needed.

### Not actionable or not urgent
- If the issue looks stale or no longer relevant, say so plainly and note that it may be closed.
- If it is valid but not urgent, say that it has been noted for later and that no immediate work is planned.

If the repository defines an environment agent and a quick reproduction check would help, you may request it. Otherwise proceed without it.

## Signaling (internal)
- If the issue stays here: add `issue-worker-ready`.
- If you created or confirmed a linked canonical issue: add `related-repo` and do **not** add `issue-worker-ready`.
