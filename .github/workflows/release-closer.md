---
description: |
  When a release is published, close related-repo issues whose fix is in this release.
on:
  release:
    types: [published]
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
  add-comment:
    max: 5
    target: "*"
  remove-labels:
    allowed:
      - awaiting-release
    max: 5
    target: "*"
  close-issue:
    max: 5
  threat-detection:
    enabled: true
    continue-on-error: false
max-ai-credits: 8
timeout-minutes: 4
---

# Release closer

Triggered when a release is published. This repository does not create releases. A maintainer does.

## Task
Read `.github/agentic-workflows/related-repos.md`.
If it does not set `release.requires_consumer_release: true` on any entry, do nothing.

Otherwise:

1. Read the published release notes and the version of each pinned package (`release.pins`).
2. Find open issues in this repository with the label `awaiting-release`.
3. For each, find the canonical issue it points at.
4. This release includes the fix only if one of these is true:
   - The release notes mention this issue number.
   - The pinned package version's release notes mention the canonical issue.
   Be conservative. If the link is not clear, leave the issue open.
5. When it is included:
   - Post a plain-language comment: "This is included in {tag}. Closing."
   - Remove `awaiting-release`.
   - Close the issue.

Do not mention labels or internal terms in the comment.
