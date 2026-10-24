---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - .github/workflows/pipeline.yml
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Merging into main is gated by a small, stable set of required checks

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Branch protection must name its required checks exactly, and the name of a matrix job includes its matrix value, so a ruleset that names `Test (22)` needs an edit every time a Node version comes or goes. A required check that is skipped by path filtering stays "expected" forever and blocks the merge. Recorded retroactively from each repository's `PIPELINE.md` and `BUILD-ENV.md` and checked on 2026-10-24.

## Decision

- The `main-branch-protection` ruleset requires `Build`, the aggregator job `Test gate`, and one platform check: `Cross-Platform Tests (Credential File Permissions)` in frodo-lib, `linux-x64-binary-release` in frodo-cli.
- `Test gate` is a stable-named aggregator over the whole test matrix, so the list of Node versions can change without touching repository settings. It runs even when a matrix leg is cancelled or skipped and accepts a skip only when the code-change filter reported no code change and `Build` succeeded.
- `paths-ignore` is never used on the `pull_request` trigger. Docs-only pull requests are recognised by the `Detect code changes` job instead, whose filter can only skip work, never hide it: any API error, push, dispatch or release run counts as a code change.
- Release commits to `main` (changelog, version, documentation) are pushed with an organisation-level fine-grained token whose identity is covered by the ruleset's admin bypass, because the Actions app cannot be a bypass actor and its pushes are rejected by the required checks.
- The pipeline documents (`PIPELINE.md`, `BUILD-ENV.md`) are updated in the same pull request as any pipeline change.

## Consequences

- A new platform check or a new Node version is a workflow change, not a settings change.
- The bypass token is a privileged secret; its scope is limited to the repositories that need it.
- Measured: both `pipeline.yml` files define `Test gate`; neither has `paths-ignore` on its pull request trigger (the push trigger keeps it).
