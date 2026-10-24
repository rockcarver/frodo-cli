---
status: accepted
date: 2026-10-24
decision-makers: maintainers
applies-to:
  - test/**
  - src/**/*.test.ts
---

# Tests run the real CLI against recorded traffic

## Context and problem statement

A CLI can only be properly tested by running the CLI: a mocked module, an imported command function or a harness that bypasses argument parsing leaves out the conditions users meet. Contributors also cannot all reach a tenant. `test/e2e/README.md` states "e2e-only by deliberate choice"; the code has grown three layers since. The rules are in `docs/CONTRIBUTE.md`, `.github/instructions/tests.instructions.md`, `AGENTS.md` and the e2e README. Recorded retroactively and measured on `main` (02a74335, 2026-10-24).

## Decision

- Three layers. `test/e2e`: tests that shell out to `frodo` as a subprocess, with HTTP replayed from recordings in `test/e2e/mocks` through frodo-lib's record and replay support (frodo-lib record 0010). `test/client_cli/en`: a snapshot of `frodo ... -h` for every command. `test/unit`: Jest on the source for logic that needs no tenant, PTY-driven tests of prompts and terminals, and the usage-examples checks.
- Tests run this checkout's build, never a `frodo` found on `PATH`. The test scripts go through `tools/with-frodo-bin.mjs`, which builds the artifact if it is missing and pins it. `npm test` runs `node dist/launch.cjs` through shims; CI runs the same suite against the native binary (`npm run test:binary`). The scripts do not rebuild a stale `dist/`: run `npx tsdown` after changing `src/`.
- A failing snapshot is decided before it is touched: expected change or regression. Snapshots are updated (`npm run test:update`) only for an expected change, and the pull request says so.
- Do not run Prettier over `test/e2e/`: exports and recordings are byte-significant because replay matches request bodies exactly.
- Every e2e test sets its own `FRODO_TEST_NAME`, and the command it runs is the command it recorded (frodo-lib record 0010).
- The master key for the committed connection fixture is never committed, created or generated. `test/e2e/env/masterkey.key` is gitignored on purpose, and suites that need a key skip unless `MasterKeyGate.js` finds a usable one.
- No credentials, keys or tokens in a test, fixture or recording.

## Consequences

Measured:

| Layer | Files |
| - | - |
| `test/e2e` | 263 e2e test files |
| `test/client_cli/en` | 364 test files, plus 2 disabled ones (`*.test_.js`) |
| `test/unit` | 56 files, among them 14 PTY tests |
| `src/**/*.test.*` | 6 files |

- The e2e README's "e2e-only" statement no longer describes the repository. The layers above do; the README line is listed in the backlog.
- Four test files are switched off by a trailing underscore in the name (`src/ops/Saml2Ops.test_.ts`, `test/unit/Config.test_.ts`, two client_cli files). Whether they are to be repaired or deleted is open (record 0029).
