---
name: run-the-tests
description: Use when you run frodo-cli's tests (unit, help snapshots, e2e replay, terminal PTY tests), or when a test fails and you must tell whether your change, a stale build, your environment or the snapshot is at fault. Covers what to rebuild first (the CLI dist and a linked frodo-lib), the stale-build warning from the test wrapper, how to read skipped and slow suites, rerunning alone, comparing against a pristine worktree of the base commit, and when not to touch snapshots or recordings.
---

# Run the tests

The commands and the replay harness are in [test/e2e/README.md](../../../test/e2e/README.md) ("Running the tests"); building is in [build-the-cli](../build-the-cli/SKILL.md). This is the order to do it in and how to judge a failure. A test result is only worth reading when the builds under it are current.

## 1. Before you run

- **Rebuild the CLI after every change to `src/`.** The default scripts (`npm test`, `npm run test:only`) run `node dist/launch.cjs`: rebuild it with `npx tsdown`. `npm run test:binary`, which is what CI runs, tests the SEA binary `dist-sea/frodo` instead: rebuild it with `npm run build:binary` (Node 26). The scripts build either one only when it is missing, so an existing one runs old code.
- **Rebuild a linked frodo-lib after every change, pull or branch switch in its clone:** `npm run build` there. `ls -l node_modules/@rockcarver/` tells you whether it is linked. A linked library is a symlink, so the tests run the clone's built `dist/`, not the pinned package CI installs. A stale one makes e2e snapshots fail locally while CI is green (for example `frodo script describe -un shared` failed locally because a stale build still printed root-realm progress lines that the published library no longer prints).
- **Believe the warning.** Every test script (`npm run test:only` and its siblings) goes through `tools/with-frodo-bin.mjs`, which prints a `WARNING` when the linked library's `dist/`, or the artifact the mode runs (`dist/launch.cjs`, plus `dist-sea/frodo` for `test:binary`), is older than its source (the check is `tools/StaleBuildCheck.mjs`). It never fails the run. `FRODO_SKIP_STALE_CHECK=1` silences it; CI skips it.
- **Do not edit `src/` or rebuild anything while a run is in progress.** The workers read files mid-run and report failures that are not real.
- **Never create or commit a master key.** Suites that need one skip without it.

## 2. Run

```console
npm run test:only -- test/unit/UsageExamples.test.js   # one file; the argument is a Jest path pattern, not a glob
npm run test:only -- test/e2e/agent-list --ci          # --ci stops Jest from writing snapshots
npm test                                               # everything, replays recordings, no network
npm run test:serial                                    # everything, one file at a time
npm run test:binary                                    # everything against the SEA binary, as CI does
```

## 3. Read the result

- **Local green is not always CI green.** CI runs `npm run test:binary` (the SEA binary); the default scripts run the npm build. When a test fails only in CI, or your change touches bundling, packaging or startup, run `npm run test:binary` locally too.
- **Skipped suites are normal.** The master-key suites skip without a usable key, and some tests are skipped on purpose. A skipped test reads no recording.
- **Terminal (PTY) suites are slow and sensitive to load.** `test/unit/*.pty.test.js` drive a real terminal. When one fails, rerun it alone: if a different test in the same suite fails the next time, it is load, not your change.
- **Progress output is not a source of timing noise.** The test scripts set `FRODO_TEST=1`, which switches off the live spinner redraw. The final lines (`Exported 12 variables.`) are deterministic, so a diff in them means the command or the library build really prints something else; look at the builds before the snapshot.
- **Do not update a snapshot to get green** ([AGENTS.md](../../../AGENTS.md)). Read the diff first. If the change is expected, update that one file's snapshot and say why in the pull request.

## 4. Is this failure mine?

Work down this list and stop at the first step that explains it.

1. **Rerun the failing suite alone** (section 2). A pass means load or ordering.
2. **Check the builds** (section 1): the warning, then `git describe --tags` in a linked library and the age of its `dist/index.js`.
3. **Run the same suite on the base commit** in a throwaway worktree, so nothing of yours is involved:

```console
git worktree add --detach <scratch-dir> <base-commit>
ln -s "$PWD/node_modules" <scratch-dir>/node_modules
cd <scratch-dir> && npx tsdown && npm run test:only -- <the failing suite> --ci
git worktree remove --force <scratch-dir>
```

The worktree shares `node_modules`, so a linked library (and its staleness) is shared too; step 2 comes first for that reason. The same failure on the base commit is not yours: say so in the pull request and do not fix it in an unrelated change.

4. **Only then change code, snapshots or recordings.** Recordings are never pruned or regenerated to make a run green; see the `create-test-recordings` skill and the e2e README ("Finding orphaned recordings") for the procedures that exist.

## Related

[create-test-recordings](../create-test-recordings/SKILL.md) for recording and replay-checking, [build-the-cli](../build-the-cli/SKILL.md) for the toolchain, [tests.instructions.md](../../../.github/instructions/tests.instructions.md) for the rules on tests and snapshots, and `test/unit/StaleBuildCheck.test.js` for what the warning does and does not cover.
