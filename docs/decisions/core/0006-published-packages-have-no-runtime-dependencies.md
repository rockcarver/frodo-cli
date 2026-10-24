---
status: accepted
date: 2026-10-10
decision-makers:
  - maintainers
applies-to:
  - package.json
  - tsdown.config.*
issues:
  - rockcarver/frodo-cli#772
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Published packages have no runtime dependencies

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

frodo-cli and frodo-lib are installed by many users and the CLI also ships as a native single-file binary. Every runtime dependency adds install weight and audit surface, and a binary has no `node_modules` to resolve anything against.

## Decision

- `dependencies` in `package.json` stays empty in both repositories.
- A package imported by shipped code is a `devDependency`. The bundler (tsdown) inlines it into the build output.
- Build and test tooling is listed in the bundler's never-bundle list so it never enters the output.
- If something genuinely cannot be bundled, raise it in the pull request. Do not move it to `dependencies` or force-bundle it.

## Consequences

- Installs are small and `npm audit --omit=dev` stays empty.
- The npm convention "imported at runtime means `dependencies`" is wrong here: moving `@inquirer/*` to `dependencies` made the bundler leave bare requires, and the native binary failed at runtime.
- After changing the dependency graph, build fresh and check the bundles for bare `require("@...")`.
