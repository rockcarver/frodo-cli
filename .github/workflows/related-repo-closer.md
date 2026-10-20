---
description: |
  When a canonical issue is closed, close the linked non-canonical issue
  that carries the related-repo label.
on:
  issues:
    types: [closed]
permissions:
  contents: read
  issues: read
safe-outputs:
  add-comment:
    max: 1
  close-issue:
    max: 1
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 4
timeout-minutes: 3
engine: copilot
---

# Related-repo closer

Triggered when an issue is closed.

## Task
Look at the closed issue body and comments for a line of the form:

`Reported from owner/repo#number`

or a comment that says it was opened from another issue.

If such a link exists:
1. Locate that original issue.
2. If it has the label `related-repo` and is still open, post a plain-language comment:
   "The work tracked in {this-repo}#{this-number} is complete. Closing this issue."
3. Close the original issue via the close-issue safe-output.

If no such link exists, do nothing.

Do not mention labels or internal terms in the comment.
