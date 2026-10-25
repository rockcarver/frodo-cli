---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - package.json
---

# frodo-cli pins frodo-lib to an exact version

## Context and problem statement

frodo-cli bundles frodo-lib (a `devDependency`, inlined at build time; umbrella 0006). The CLI's CI must validate against the library version the CLI will ship with, not against whatever a caret range happens to resolve to. Recorded retroactively from `docs/BUILD-ENV.md` (2026-10-05) and checked on `main` (02a74335, 2026-10-24).

## Decision

- `package.json` pins `@rockcarver/frodo-lib` to an exact version, never a range (e.g. `5.0.0-12`).
- After each library release that the CLI needs, a pull request bumps the pin. Dependabot's weekly grouped update can propose it, and a maintainer can open the bump by hand once npm serves the new version.
- A CLI change that needs a library change waits for the library release and then bumps the pin (umbrella 0001: library first).

## Consequences

- Measured on 2026-10-24: the pin is exact (`5.0.0-12`).
- A library fix reaches CLI users only with the next CLI release; a hotfix in the library needs a CLI release too.
