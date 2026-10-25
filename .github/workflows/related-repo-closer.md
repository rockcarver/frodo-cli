---
name: "Concierge 4b Related Repo Closer"
description: |
  When a canonical issue (one that carries original-in-related-repo) is closed,
  close the linked non-canonical issue that carries the related-repo label.
if: ${{ github.event.issue.user.type != 'Bot' && contains(github.event.issue.labels.*.name, 'original-in-related-repo') }}
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
    github-token: ${{ secrets.FRODO_LIB_ISSUES_TOKEN }}
    allowed-repos: ["rockcarver/frodo-lib"]
  add-labels:
    github-token: ${{ secrets.FRODO_LIB_ISSUES_TOKEN }}
    allowed-repos: ["rockcarver/frodo-lib"]
    allowed:
      - waiting-for-release
    max: 1
    target: "*"
  close-issue:
    max: 1
    github-token: ${{ secrets.FRODO_LIB_ISSUES_TOKEN }}
    allowed-repos: ["rockcarver/frodo-lib"]
  threat-detection:
    enabled: false
max-ai-credits: 6
timeout-minutes: 3
---

# Related-repo closer

Triggered when an issue is closed. The activation condition already checked that the closed issue carries `original-in-related-repo`, so it was opened from an issue in a related repository; do not look at any other closed issue.

## Task
Look at the closed issue body and comments for a line of the form:

`Reported from owner/repo#number`

or a comment that says it was opened from another issue.

If such a link exists:
1. Locate that original issue.
2. Read `.github/agentic-workflows/related-repos.md` in the original repository if you can.
3. If that config sets `release.requires_consumer_release: true` for this repository:
   - Do **not** close the original issue.
   - Add the label `waiting-for-release`.
   - Post a plain-language comment:
     "The fix is in {this-repo}#{this-number}. This stays open until a release of {original-repo} pins a {this-repo} version that contains that fix."
4. Otherwise, if the original issue has `related-repo` and is still open:
   - Post: "The work tracked in {this-repo}#{this-number} is complete. Closing this issue."
   - Close it.

If no such link exists, do nothing.

Do not mention labels or internal terms in the comment.
