---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - package.json
  - scripts/**
  - sea-config.json
  - tsdown.config.ts
  - tsdown.sea.config.mts
---

# The CLI ships as native Node.js binaries and supports Node.js 26 only

## Context and problem statement

Users install frodo as an npm package, as a Homebrew formula, or as a self-contained binary. The binary used to be built with `pkg`, which is no longer maintained. Node.js can now build a single executable itself (`node --build-sea`, Node 25.5 and later). Recorded retroactively from `docs/BUILD-ENV.md`, `docs/PIPELINE.md` and `MIGRATION.md`, decided in October 2026 (migration #741), and checked on `main` (02a74335, 2026-10-24).

## Decision

- The release binaries are native Node.js single executable applications (`node --build-sea`), not `pkg` builds, for five targets: linux-x64, linux-arm64, macos-arm64, macos-intel (cross-built on an arm64 runner) and windows-x64. Each is smoke-tested before it is archived.
- macOS binaries are signed with a Developer ID certificate and notarized in the release pipeline; a local build is ad-hoc signed so it runs at once. Windows binaries are unsigned.
- Developing the CLI requires Node.js 26 (`engines.node >= 26`), because the binary embeds Node 26 and the SEA build needs it. Version 5.x is tested on Node.js 26 only; the binaries have no Node.js requirement. frodo-lib keeps its own matrix (22, 24 and 26).
- The npm package (`dist/`) and the Docker image are built from the same sources with `tsdown`; the SEA bundle is a separate single-file build.

## Consequences

- Measured: `engines.node` is `>=26`; the pipeline has five binary-release jobs; the `pkg` configuration is gone.
- A bundled package that cannot be inlined breaks the binary at run time (umbrella 0006), which is why the SEA end-to-end leg runs in CI.
- The binary is larger than the `pkg` one (about 44 MB zipped against 30 MB); accepted because users download zips.
- Homebrew installs these binaries (umbrella 0008).
- A mismatch between documents is open: `docs/PIPELINE.md` says the Build job runs on Node 24 as "the npm support floor", while `engines` and the migration guide say Node 26 only (record 0029).
