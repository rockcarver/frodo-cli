---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - .github/dependabot.yml
  - .github/workflows/dependabot-auto-merge.yml
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Dependency updates merge automatically only when they are patch or minor

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

Both repositories receive weekly dependency updates and security fixes. Reviewing every one by hand does not scale, and merging a major bump unseen is how a build breaks. Umbrella record 0002 names Dependabot's patch and minor updates as the only auto-merge; this record states the policy behind it. Recorded retroactively from each repository's `BUILD-ENV.md` and checked on both `main` branches on 2026-10-24.

## Decision

- `dependabot.yml` runs weekly for npm and for GitHub Actions. Development-dependency minor and patch updates are grouped into one pull request. The exact `@rockcarver/frodo-lib` pin in frodo-cli follows the same route.
- `dependabot-auto-merge.yml` arms auto-merge on a Dependabot pull request that is a patch or minor update (security updates included) once the required checks are green. It is guarded on the Dependabot actor.
- Majors and the tooling set (Prettier, TypeScript, ESLint) stay manual; TypeScript majors are ignored outright. Dependabot "rules" in the repository settings only triage alerts and cannot merge, so the workflow is the mechanism.
- Nothing else auto-merges (umbrella record 0002).

## Consequences

- Measured: both repositories have `dependabot.yml` (npm and github-actions, weekly) and `dependabot-auto-merge.yml`.
- A green merge state can lag behind green check runs; wait and retry, and merge by hand only after the check runs are verified through the API.
- A change to the policy needs a new record.
