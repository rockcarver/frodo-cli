---
description: |
  When a canonical issue is closed, close the linked non-canonical issue
  that carries the related-repo label.
on:
  issues:
    types: [closed]
engine:
  id: copilot
  model: small
max-turns: 6
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
    max: 1
    target: "*"
  add-labels:
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - awaiting-release
    max: 1
    target: "*"
  close-issue:
    max: 1
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 6
timeout-minutes: 3
---

# Related-repo closer

Triggered when an issue is closed.

## Task
Look at the closed issue body and comments for a line of the form:

`Reported from owner/repo#number`

or a comment that says it was opened from another issue.

If such a link exists:
1. Locate that original issue.
2. Read `.github/agentic-workflows/related-repos.md` in the original repository if you can.
3. If that config sets `release.requires_consumer_release: true` for this repository:
   - Do **not** close the original issue.
   - Add the label `awaiting-release`.
   - Post a plain-language comment:
     "The fix is in {this-repo}#{this-number}. This stays open until a release of {original-repo} includes that fix."
4. Otherwise, if the original issue has `related-repo` and is still open:
   - Post: "The work tracked in {this-repo}#{this-number} is complete. Closing this issue."
   - Close it.

If no such link exists, do nothing.

Do not mention labels or internal terms in the comment.
