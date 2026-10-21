---
description: |
  When a release is published, mark included issues as released.
on:
  release:
    types: [published, prereleased]
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
  add-labels:
    github-token: ${{ secrets.SIGNAL_TOKEN }}
    allowed:
      - released
    max: 5
    target: "*"
  remove-labels:
    allowed:
      - waiting-for-release
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

## This repository owns the fix

Find issues with `waiting-for-release` that this release includes.

A mention counts when:
- The release notes mention the issue number, or
- The release notes mention a pull request, and that pull request closes the issue (`Fixes`, `Closes`, or `Resolves`).

For each:
1. Remove `waiting-for-release`.
2. Add `released`.
3. Post: "Included in {tag}."

Do not reopen a closed issue.

## This repository consumes the fix

Read `.github/agentic-workflows/related-repos.md`.
Apply this only when an entry sets `release.requires_consumer_release: true`.

1. Read the published release notes and the version of each pinned package (`release.pins`).
2. Find issues here with `waiting-for-release`.
3. This release includes the fix only when it pins the related version that contains it, or the notes mention this issue.
   If the pin does not include the fix, leave the issue as it is.
4. When it is included:
   - Remove `waiting-for-release`.
   - Add `released`.
   - Post: "Included in {tag}, which pins {package} {version}."
   - Close the issue if it is still open.

Do not mention labels or internal terms in the comment.
