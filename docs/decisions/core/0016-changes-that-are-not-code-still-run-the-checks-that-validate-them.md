---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - .github/workflows/pipeline.yml
  - .github/scripts/classify-changes.sh
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Changes that are not code still run the checks that validate them

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Record 0012 lets the `Detect code changes` job skip the long test matrix when a pull request changes no code. Measured on 2026-10-24, its allowlist (`docs/`, root `*.md`, `LICENSE`, some `.github/` paths) fits guidance files badly in both directions. Guidance files that are not on it (frodo-cli: `.claude/skills/`, `.github/instructions/`; frodo-lib: `decisions/`, `.claude/skills/`, `.github/instructions/`) start the whole matrix for a change that touches no behaviour. Files that are on it but are checked by a test (`docs/decisions/`, `AGENTS.md` and `CLAUDE.md` in frodo-cli) start no test at all, so a malformed record or skill can merge unchecked: frodo-cli's records-only pull request skipped every test, although `test/unit/DecisionRecords.test.js` is what validates records.

## Decision

- Guidance content counts as non-code for skipping the long test matrix: the agent entry points (`AGENTS.md`, `CLAUDE.md`), decision records, skills and instruction files.
- A file that a test validates is covered by a fast `guidance` job that runs whenever such a file changes, also when the code filter says non-code. The classifier emits a `guidance` output next to `code`; the job installs dependencies and runs only the validation tests.
- `Test gate` aggregates the guidance job. It fails if the job was expected and did not succeed, so the required checks stay `Build`, `Test gate` and the platform check, and no ruleset changes (record 0012).
- The classifier is the script `.github/scripts/classify-changes.sh`, with a fixture test, in each repository, not inline shell. A new guidance path is a one-line change plus a fixture.
- A pull request that adds a validated file type adds its path to the classifier in the same pull request. A change to `pipeline.yml` or the classifier counts as code, and `PIPELINE.md` and `BUILD-ENV.md` change with it.

## Consequences

- Pull requests that only change guidance merge in minutes instead of waiting for the full matrix, and an invalid record or skill still blocks the merge.
- One more job and one more script to maintain in each repository. The path lists differ per repository (frodo-lib keeps records in `decisions/`, frodo-cli in `docs/decisions/`) and live in that repository's classifier.
- Anything not on the guidance or docs paths still runs the full suite.

## Alternatives considered

- **Extend the allowlist only:** rejected, because records and skills would merge without their validation.
- **Run everything on every change:** rejected, because it wastes CI minutes and makes guidance pull requests slow to merge.
- **A separate required check for guidance:** rejected, because it changes the ruleset and breaks the stable set of required checks in record 0012.
