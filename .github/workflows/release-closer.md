---
description: |
  When a release is published, close issues whose fix shipped in this release.
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

Two close rules. Apply only the one that fits this repository.

## This repository owns the fix

Example: a library release.

Close an open issue in this repository when the release notes mention that issue.
Post: "This is included in {tag}. Closing."
Then close it.

Do not close an issue in another repository from here.

## This repository consumes the fix

Read `.github/agentic-workflows/related-repos.md`.
Apply this only when an entry sets `release.requires_consumer_release: true`.

1. Read the published release notes and the version of each pinned package (`release.pins`).
2. Find open issues here with the label `awaiting-release`.
3. For each, find the canonical issue and the related-repository version that contains that fix.
4. Close this issue only when this release pins that version, or a newer one.
   The release notes mentioning this issue is also sufficient.
   If the pin does not include the fix, leave the issue open.
5. When closing:
   - Post: "This is included in {tag}, which pins {package} {version}. Closing."
   - Remove `awaiting-release`.
   - Close the issue.

Do not mention labels or internal terms in the comment.
