---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - package.json
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Published packages ship only an allowlist of files

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

`npm pack` is the supply-chain surface: whatever is in the tarball is installed on every machine, and junk in it is junk everywhere. Before October 2026 the tarballs carried hundreds of files (caches, test results, assessment reports, examples with lockfiles). Recorded retroactively from each repository's `BUILD-ENV.md` ("npm package contents") and checked on 2026-10-24.

## Decision

- `package.json` has a `files` allowlist in both repositories; nothing outside it is published. It lists the build output, the licence, the README and the changelog, and in frodo-lib the postinstall patch script.
- Developer documents (`CONTRIBUTE.md`, `RECORD_REPLAY.md`), examples and test resources are not published; the GitHub README is the documentation.

## Consequences

- Measured: frodo-lib `files` is `dist`, `types`, `scripts/patch-axios-types.cjs`, `LICENSE`, `README.md`, `CHANGELOG.md`; frodo-cli `files` is `dist/*.cjs`, `dist/*.cjs.map`, `LICENSE`, `README.md`, `CHANGELOG.md`.
- frodo-lib's `BUILD-ENV.md` still says the `types/` tree is dropped from the tarball while `files` lists it; the document or the list needs a correction (frodo-lib record 0013).
- A new runtime file that the package needs is added to the allowlist in the same pull request.
