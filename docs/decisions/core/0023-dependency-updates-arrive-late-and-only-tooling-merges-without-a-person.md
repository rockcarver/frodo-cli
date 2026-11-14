---
status: accepted
date: 2026-11-14
decision-makers:
  - maintainers
applies-to:
  - .github/dependabot.yml
  - .github/workflows/dependabot-auto-merge.yml
  - scripts/dependabot-auto-merge.mjs
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Dependency updates arrive late, and only tooling merges without a person

## Context and problem statement

[Core 0011](0011-dependency-updates-merge-automatically-only-for-patch-and-minor.md) lets every Dependabot patch or minor update merge once the checks are green. Updates of that kind merged within minutes of being opened. Many of the packages concerned are bundled into what we ship, so a release that is published and then withdrawn within days, the usual shape of a poisoned release, could reach `main` unattended. A package name test of the workflow also matched by substring, so whether a weekly group armed depended on whether it happened to contain an `eslint-*` package. A bump of a direct dependency also moves transitive packages in the lockfile to whatever is newest, however young.

## Decision

- **Delay.** A version update is proposed only once its release is 7 days old (`cooldown`, `default-days` in `dependabot.yml`, for npm and GitHub Actions). Our own actions (`gearsnlevers/*`) and, in frodo-cli, the pin of `@rockcarver/frodo-lib` are excluded. Security updates are not delayed.
- **Two sets.** *Bundled* packages are every package that shipped source imports and the library pin of frodo-cli: each update arrives as its own pull request and a person merges it after looking at what changed in the package (files, dependencies, install scripts), security updates included. The bundler that writes the shipped file (`tsdown`) is treated like a bundled package. *Tooling* is a named list in `dependabot.yml`: minor and patch updates are grouped into one weekly pull request.
- **Auto-merge.** `dependabot-auto-merge.yml` arms auto-merge only for a tooling pull request that is a patch or minor update, once the required checks are green and every package version that the pull request adds to the lockfile, direct or transitive, was published at least 7 days ago. A pull request that fails the age test is checked again every day and armed when it passes; a registry that cannot be read means it is not armed. Majors, Prettier, TypeScript and ESLint with its plugins stay manual, as in core 0011. The workflow is guarded on the Dependabot actor and nothing else auto-merges ([core 0002](0002-a-maintainer-stays-the-last-lever-on-agent-work.md)).
- **GitHub Actions and security updates.** A GitHub Actions update is not in the `tooling` list, so a person merges it: an action runs with the credentials of our workflows. A security update follows the same rules as any other: for a tooling package it is armed once it passes the age test (a fresh fix is young, so it is usually held), and otherwise a person merges it promptly after reading the advisory. A person may merge any pull request at any time.
- **Lists, not defaults.** A package in neither set is not auto-merged. A test fails when the tooling list would match a package that shipped source imports, so a bundled package cannot slip into the auto-merge by a pattern.

## Consequences

- Version bumps of bundled packages need a person, about weekly; the review is the package's changed files and manifest, not the whole upstream history.
- Tooling updates still merge unattended, once they are a week old and green.
- The tooling list in `dependabot.yml` is maintained by hand and checked by a test; a new tooling package is merged by a person until it is added.
