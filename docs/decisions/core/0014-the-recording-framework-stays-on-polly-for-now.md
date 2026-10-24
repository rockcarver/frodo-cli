---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - src/utils/SetupPollyForFrodoLib.ts
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# The recording framework stays on Polly until Node 28 or a real breakage forces a change

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

HTTP traffic in both test suites is recorded and replayed with Polly.js, which has not been released since 2023. A spike in October 2026 tried nock Back and MSW. Recorded retroactively from each repository's `BUILD-ENV.md` ("DEFERRED") and checked on 2026-10-24.

## Decision

- Polly stays. A replacement (nock or MSW) is deferred, not rejected.
- The deferral ends when Node 28 arrives or a real breakage forces the change.

## Consequences

- The spike showed that replay fidelity is not the obstacle (nock Back with a small converter replayed 425 of 425 entries of the largest recording). The obstacle is the record-mode harness: per-host routing, the shared login cassette and 28 routing directives are coupled to Polly, so a swap is not a three-file change.
- The record and replay mechanism is a library feature used by frodo-cli (frodo-lib record 0010).
