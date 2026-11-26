---
status: proposed
date: 2026-11-26
decision-makers: maintainers
applies-to:
  - src/launch.ts
  - global-jest-setup.js
  - test/unit/LauncherCompileCache.test.js
---

# The npm entry keeps Node's compile cache in the config folder and turns it off where it cannot pay

## Context and problem statement

Node can keep what V8 compiled for every file a program loads and hand it back on the next start. On 2026-11-26, once the entry of the npm package ran the app in one process with no loader and with source maps off, this saved about 60 ms on every start after the first (`frodo -v`, `-h` and `conn list` alike) and cost about 60 to 110 ms once, on the first start after a Node or CLI update. Node's default folder is a shared one in the temporary folder of the machine, which is the wrong place for two reasons: on a machine with several users another user could plant an entry that this user's process then loads, and the operating system cleans that folder. A cache also pays only where a second start follows the first, so a fresh container or a test run with a new HOME would pay for it and never get it back.

## Decision

- **The entry (`src/launch.ts`) turns the cache on before the app loads**, with the folder `compile-cache` in the config folder: `FRODO_CONFIG_PATH`, else `.frodo` in the home folder, the same folder as the rest of the CLI. The folder is made for its owner only (mode `0700`). It is never the temporary folder, and never a folder next to the installed files.
- **It is off, and makes no folder, when** the `CI` variable is set (not empty, not `0`, not `false`), `FRODO_TEST` or `FRODO_MOCK` is set the same way, `FRODO_NO_COMPILE_CACHE` has an opt-in value (`1`, `true`, `yes` or `on`, as every opt-in), `NODE_DISABLE_COMPILE_CACHE` is set, or `NODE_COMPILE_CACHE` is set (the user's own cache is used and none is made beside it).
- **It never changes a start.** If the folder cannot be made or used (a read-only home, a file where a folder should be) the CLI starts as it would without the cache: same output, same exit code, and the entry prints and throws nothing.
- **Nothing deletes the cache.** Node keeps one sub-folder for each Node version and the entries of an old CLI version stay, so the folder grows by about one bundle for every version that ran. The entry has no pruning code; removing `compile-cache` is always safe, and the docs say so.
- **A test that starts the CLI runs it with the cache off.** The global setup of the tests sets `FRODO_NO_COMPILE_CACHE=1`, and the tests of the cache build their own environment. The native binary is not covered: it starts the app itself and carries a code cache of its own.

## Consequences

- `test/unit/LauncherCompileCache.test.js` pins the folder, the mode, every off switch and the unusable-folder cases; `test/unit/LauncherCommandLine.test.js` pins the order of the steps (source maps, cache, `process.argv[1]`, the app) and that the entry stays standalone.
- A new off switch or a new place for the folder changes this record, the entry and the tests together, and `docs/BUILD-ENV.md` section 2.4 and `MIGRATION.md` say what a user sees.
- A Docker image that mounts the config folder keeps the cache between runs; one that does not pays the first-start cost on every run and can set `FRODO_NO_COMPILE_CACHE=1`.
- Not covered: pruning old entries, and a cache for the commands of the shell console or for child processes.

## Alternatives considered

- **Node's default folder in the temporary folder**: shared between users and cleaned by the system.
- **Always on**: a CI job, a test run and a container that lives for one command pay the first-start cost for nothing.
- **Pruning code in the entry**: a delete in a start path, for a few megabytes, against a guard that keeps deletes out of `src`.
