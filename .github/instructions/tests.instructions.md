---
applyTo: 'test/**'
---

# Tests

- **Three layers.** `test/unit`: Jest on the source (ops, utils, PTY-driven prompts, the usage-examples check). `test/client_cli/en`: snapshots of `frodo ... -h` for every command. `test/e2e`: tests that shell out to `frodo`, with HTTP replayed from recordings in `test/e2e/mocks`. How to write and record e2e tests: [test/e2e/README.md](../../test/e2e/README.md).
- **Run:** `npm run test:only -- <path pattern>` for a subset, `npm test` for everything.
- **The test scripts do not rebuild `dist/`.** CLI-level tests (client_cli, e2e, PTY) run `dist/launch.cjs`. After changing `src/`, run `npx tsdown` first. Otherwise they pass or fail against the old code. `npm run test:binary` (what CI runs) tests `dist-sea/frodo` instead, which `npm run build:binary` builds and the scripts do not refresh either. Do not edit `src/` or rebuild `dist/` or `dist-sea/` while a suite is running.
- **A failing snapshot is either an expected output change or a regression.** Decide which before touching it. Update a snapshot (`npm run test:update`) only for an expected change, and say so in the pull request. Never update snapshots just to turn CI green.
- **Do not run Prettier over `test/e2e/`.** `npm run fix` and `npm run check` only cover `src/**/*.ts`. Prettier would rewrite the exported fixtures (it does for `test/e2e/exports/all/allAlphaJourneys.journey.json`), and replay matches recorded requests exactly.
- **Never commit, create or generate a master key.** `test/e2e/env/masterkey.key` is gitignored on purpose. Suites that need a key gate on `checkMasterKeyUsable()` and `testif()` from `test/e2e/utils/MasterKeyGate.js` and skip without a usable key; see the master key note in the e2e README.
