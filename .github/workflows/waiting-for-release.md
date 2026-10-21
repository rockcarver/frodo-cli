---
description: |
  When an issue is closed by a merged pull request, mark it waiting for a release.
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
  pull-requests: read
tools:
  bash: false
  cli-proxy: false
  github:
    min-integrity: none
safe-outputs:
  add-comment:
    max: 1
  add-labels:
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - waiting-for-release
    max: 1
  threat-detection:
    enabled: false
max-ai-credits: 6
timeout-minutes: 3
---

# Waiting for release

Triggered when an issue is closed.

## Task
If the issue was closed because a pull request merged (`Fixes`, `Closes`, or `Resolves`, or a linked merged PR):

1. Add the label `waiting-for-release`.
2. Post a plain-language comment: "Fixed in {pr}. Waiting for a release that includes this."

If it was closed for another reason (duplicate, not planned, or already released), do nothing.

Do not mention labels or internal terms in the comment.
