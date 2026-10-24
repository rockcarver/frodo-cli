---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Releases are started by a maintainer through the pipeline

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

A release publishes packages other people install. Recorded retroactively; both pipelines already worked this way.

## Decision

- A release exists only because a maintainer started the pipeline by hand (`workflow_dispatch` on `main`). Merging never releases.
- One run builds, tests, publishes to npm and creates the GitHub release; for the CLI it also builds the native binaries and updates the Homebrew formulas.
- Stable releases go to the npm `latest` tag, prereleases to `next`.
- The version and the changelog are produced by the pipeline at release time. Nobody edits `CHANGELOG.md` in a pull request. A removed or renamed public function or command goes into `MIGRATION.md`.

## Consequences

- Releasing is deliberate, and a bad release is fixed forward with a new one.
- Prereleases on `next` let users try a change before it becomes stable.
- Pull request titles and descriptions matter: they feed the generated changelog.
