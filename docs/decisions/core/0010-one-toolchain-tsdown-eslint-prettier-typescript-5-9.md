---
status: accepted
date: 2026-10-24
decision-makers:
  - maintainers
applies-to:
  - package.json
  - tsdown.config.*
  - eslint.config.*
issues:
  - rockcarver/frodo-lib#674
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
---

# Both repositories use one toolchain: tsdown, ESLint 10 with Prettier, and TypeScript 5.9

Recorded in the umbrella repository rockcarver/frodo (archived 2026-10) until 2026-10-24; this copy is the record.

## Context and problem statement

frodo-cli and frodo-lib share most of their build and lint toolchain, which was modernised in October 2026 (the old bundler was unmaintained and had produced invalid CommonJS output). The choices are documented in each repository's `BUILD-ENV.md` as history; this record states them as rules. Recorded retroactively and checked on both `main` branches on 2026-10-24.

## Decision

- The bundler is tsdown (rolldown-based). tsup is not used.
- Linting is ESLint 10 with a native flat config and `eslint-plugin-import-x`; `typescript-eslint` provides the TypeScript rules.
- Prettier, pinned to an exact version, owns formatting and import order (the `@ianvs/prettier-plugin-sort-imports` plugin). ESLint does not check import order, so the two cannot disagree. A Prettier update ships with its repository-wide reformat in the same commit. `eslint-plugin-prettier` is not used.
- `npm run fix` writes (ESLint fix, then Prettier write); `npm run check` only reads and is what CI runs. Neither touches `test/e2e` fixtures in the CLI.
- TypeScript stays on 5.9.x. It moves to 6 or 7 only when `typedoc`, `typescript-eslint` and `ts-jest` accept it.

## Consequences

- Measured: both repositories have tsdown 0.23.1, ESLint 10.12.0 and the `check` and `fix` scripts above; TypeScript is `5.9` (exact) in frodo-lib and `^5.9.3` in frodo-cli. frodo-lib still contains a `tsup.config.ts` that nothing uses.
- Dependabot does not propose Prettier, TypeScript or ESLint updates (umbrella record 0011); a maintainer moves them.
- Each repository keeps its own `BUILD-ENV.md` for the details that differ.
