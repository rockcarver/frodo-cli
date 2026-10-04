# E2E tests

frodo-cli's tests are e2e-only by deliberate choice: a CLI can only be properly tested by running the CLI, so these tests avoid anything in between — a mocked module, an imported command function, a harness that bypasses argument parsing — that would leave out real conditions or cut testing corners. Every test in this directory shells out to the `frodo` binary on `PATH` as a subprocess, exactly as a user would invoke it, and asserts on its stdout/stderr, usually via a snapshot. Worth calling out: there's also a hard technical constraint pointing the same direction — Jest's real-ESM mode (required by this project) can't load `@rockcarver/frodo-lib`'s built bundle, so no unit test could import a real `src/cli/**/*.ts` command file even if that were desired.

HTTP traffic from those subprocesses is recorded and replayed by frodo-lib's built-in record/replay support ([Polly.js](https://netflix.github.io/pollyjs/), wired up inside frodo-lib, not by the Jest harness). Recordings live under `test/e2e/mocks/` as HAR fixtures and are committed to the repo.

**This document covers how frodo-cli uses that support** — its connections, helpers, conventions and maintenance procedures. How the mechanism itself works (every `FRODO_MOCK*` variable, request routing and matching, recording names and layout, shared login cassettes, secret filtering) is documented once, for every tool built on frodo-lib, in frodo-lib's [record and replay developer guide](https://github.com/rockcarver/frodo-lib/blob/main/RECORD_REPLAY.md). Read that first if a term below is unfamiliar.

- [Running the tests](#running-the-tests)
- [How the harness works](#how-the-harness-works)
- [Writing a test](#writing-a-test)
- [Shared login recordings](#shared-login-recordings)
- [Expiration](#expiration)
- [Re-recording individual tests](#re-recording-individual-tests)
- [Bulk-recording cloud tests](#bulk-recording-cloud-tests)
- [Multi-phase recording for destructive tests](#multi-phase-recording-for-destructive-tests-importdelete-pairs)
- [Classic and ForgeOps](#classic-and-forgeops)
- [Finding orphaned recordings](#finding-orphaned-recordings)
- [Known gaps](#known-gaps)

## Running the tests

```console
npm run test:only                    # replay everything (parallel)
npm run test:only e2e/agent-list     # one file; the argument is a Jest path pattern, not a glob
npm run test:serial                  # replay everything, one file at a time
```

Replay needs no network access and no credentials of yours.

**The binary under test is this checkout's build, and the test scripts pin it for you.** Every `npm run test:*` script goes through `tools/with-frodo-bin.mjs`, which builds `dist-sea/frodo` on demand (guarded by a lock file so concurrent runs don't clobber each other) and prepends `dist-sea` to `PATH` for the run — tests spawn exactly that binary, never whatever stale `frodo` might sit elsewhere on your `PATH`. The binary bundles frodo-lib, so a foreign binary would fail in confusing ways (typically `Recording for the following request has expired / is not found` for changes it doesn't contain) — but the pin makes that a non-issue for npm-script runs. Before trusting a result:

```console
test/e2e/utils/FrodoBinary.cjs        # how the binary path is resolved
ls dist-sea/frodo                     # built on first test run; rm -rf to force a rebuild
```

After changing frodo-lib, rebuild it first and then rebuild frodo-cli (`npm run build` in each; `npm run build:binary` re-cuts the SEA binary); after changing only frodo-cli, `npm run build` here. If you bypass the npm scripts and invoke `npx jest` directly, run `node tools/with-frodo-bin.mjs npx jest ...` instead, or set up the pin yourself — see `FrodoBinary.cjs`'s `getTestBinaryPath()`.

## How the harness works

Controlled by the `FRODO_MOCK` env var, read at process start by the `frodo` binary:

| `FRODO_MOCK` | Behavior |
| --- | --- |
| unset | Real network calls, no mocking. Only useful when deliberately hitting a live tenant outside of a test. |
| `1` | Replay mode. Requests are matched against existing recordings; a miss fails with `Recording for the following request is not found`. This is what `npm run test:only`/`test:serial` use by default — each test file sets `process.env['FRODO_MOCK'] ||= '1'` itself, so an external `FRODO_MOCK=record` (from `npm run test:record:cloud` or a manual invocation) still overrides it. |
| `record` | Record mode. Requests hit the real network and responses are persisted as new/updated recordings. |

Every test file builds the environment for its subprocess with `getEnv(connection)` from `test/e2e/utils/TestUtils.js`, using one of the fixed test identities in `test/e2e/utils/TestConfig.js`:

| Connection | Type | Used for |
| --- | --- | --- |
| `connection` | `cloud` | PingOne Advanced Identity Cloud (service account and admin credentials) |
| `iga_connection` | `cloud` | Identity Governance tests |
| `forgeops_connection` | `forgeops` | ForgeOps (AM, IDM, DS) |
| `classic_connection` | `classic` | Classic, AM-only |
| `amster_connection` | `classic` | Classic with Amster authentication |

`getEnv()` does the following, so a test file never has to:

- **Connection and credentials.** In replay mode it sets `FRODO_HOST` and, as applicable, `FRODO_USERNAME`/`FRODO_PASSWORD`/`FRODO_SA_ID`/`FRODO_SA_JWK`/`FRODO_AMSTER_PRIVATE_KEY`, plus `FRODO_IGA`/`FRODO_PINGFED`/`FRODO_AUTHENTICATION_SERVICE` where the connection carries them. When recording, it leaves the credential variables unset and sets `FRODO_CONNECTION` (the name of your own saved connection profile) instead, so the run uses your real credentials.
- **Deployment type.** It exports the connection's `type` as `FRODO_MOCK_DEPLOYMENT`, which is how frodo-lib chooses the [shared login cassette](#shared-login-recordings). **Every connection in `TestConfig.js` needs a `type`.**
- **Profile isolation.** In replay mode it points `FRODO_CONNECTION_PROFILES_PATH` and `FRODO_MASTER_KEY_PATH` at the committed `test/e2e/env/Connections.json` and `test/e2e/env/masterkey.key`. Without that the CLI would fall back to your real `~/.frodo/Connections.json`, so a replay could read — and a test that saves or deletes profiles could write — your live profiles. Tests that manage profiles (`conn save`/`delete`/`alias`) opt into their own files with `getEnv(conn, { preserveProfilePaths: true })`. Recording keeps your real profiles, since `FRODO_CONNECTION` names one.

Variables you set yourself when recording: `FRODO_NO_CACHE=1` (always — it disables frodo's on-disk token cache so a command really re-authenticates instead of reusing a cached token, otherwise the login calls you are trying to capture may never happen), `FRODO_TEST_NAME` (see [Writing a test](#writing-a-test)), and `FRODO_HOST`/`FRODO_CONNECTION` to pick the environment to record from. The full list, including the ones that control cassettes and expiration, is in the [frodo-lib guide](https://github.com/rockcarver/frodo-lib/blob/main/RECORD_REPLAY.md#environment-variables).

**Recording against your own tenant.** Route-specific recording names are only applied to hosts in `FRODO_MOCK_HOSTS`, which defaults to the frodo development hosts (`openam-frodo-dev`, `openam-volker-dev`, `openam-volker-demo`, `nightly.gcp.forgeops.com`, and the classic test host). If you record against a tenant that is not on that list, list it, or its traffic lands in a stray `default_*` recording instead of the per-area ones:

```console
FRODO_MOCK=record FRODO_NO_CACHE=1 \
FRODO_MOCK_HOSTS=https://openam-mytenant.forgeblocks.com \
FRODO_HOST=https://openam-mytenant.forgeblocks.com/am \
npm run test:update e2e/agent-list
```

Setting it **replaces** the default list, so add any default host the same run also talks to (a comma-separated list, origins only, no `/am`). Replay needs nothing extra: the tests replay against the frodo-dev hosts from `TestConfig.js`, which are on the default list, and matching ignores the host you recorded from. If a `default_*` directory shows up under `test/e2e/mocks/` after a recording pass, an unlisted host is the cause; delete it and re-record. Details are in the [frodo-lib guide](https://github.com/rockcarver/frodo-lib/blob/main/RECORD_REPLAY.md#hosts).

## Writing a test

Every test should carry its own explicit `FRODO_TEST_NAME` — a short, file-unique label that identifies its recording, independent of the command's actual arguments and flags. This is what lets you write as many test cases as you need for a given command, even ones that share the exact same invocation (e.g. the same command run against different realms, or a success/failure variant of the same flags) — the recording's identity is the label you chose, not an incidental property of the flags you happened to pass.

1. Pick a short label for the test case (e.g. `noDeps`, `allSeparate`, `invalidCredentials`) — unique among the other tests in the same file, since collisions silently overwrite one another's recording.
2. Check whether a recording already exists under that label by running the exact command in replay mode with it set: `FRODO_MOCK=1 FRODO_TEST_NAME=<name> frodo <command>`. For a genuinely new label this will normally fail — that's expected, move to step 3.
3. Record it: `FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=<host> FRODO_TEST_NAME=<name> frodo <command>` (or `npm run test:update <pattern>` once the test itself is written — see below). Wait for Polly's shutdown countdown ("Polly instance '...' stopping in 3s...") to finish before running anything else against the same recordings.
4. Validate the recording by re-running step 2.
5. Write the test using the exact command you recorded with, and pass the same `FRODO_TEST_NAME` in its `env` — both record and every future replay must use the identical value, since it's now part of the recording's location, not just a recording-time flag:
   ```js
   const { stdout } = await exec(CMD, {
     env: { ...env.env, FRODO_TEST_NAME: 'noDeps' },
   });
   ```
6. Commit both the test and the new/updated files under `test/e2e/mocks/`.

**Don't put the host on the command line.** A recording's identity includes every positional word between the subcommand and the first flag, so `frodo agent ai delete -i x` and `frodo agent ai delete some-host -i x` are different recordings. The host comes from `FRODO_HOST`, which `getEnv()` sets. (Commands whose argument *is* a host, such as `frodo info <url>` or `frodo conn save <url>`, are the exception, by nature.)

**The command you run is the command you record.** Keep the test's `CMD` identical to the recorded one (same flags, same order). A test titled "delete" that actually runs `create`, or a `-p` path that matches nothing, can pass without ever exercising the recorded traffic. That is exactly the kind of drift [Finding orphaned recordings](#finding-orphaned-recordings) surfaces.

**Fallback (existing tests, not recommended for new ones).** If `FRODO_TEST_NAME` is unset, an identity is derived from the command's argument count and flags instead. Most of the existing suite was recorded this way, and it still works — but it means two test cases with identical arguments silently collide, changing a flag renames (and so orphans) the recording, and it's the reason older test files carry a hand-maintained comment block listing every exact recording command, so a human can eyeball that no two are alike. Prefer setting `FRODO_TEST_NAME` explicitly on every new test instead of relying on this.

## Shared login recordings

Every test that logs in used to record and replay its own copy of the identical login sequence (`/am/oauth2/*`, `/am/json/*/authenticate`, and the `getSessionInfo` call right after it). That sequence now lives in one fixture per deployment type, under `test/e2e/mocks/shared_*/auth_*/<type>_*/`, and every test of that type replays it. What stays per test is the command's own behavior — including `serverinfo`, which differs per deployment.

| Type | Recording name | Holds |
| --- | --- | --- |
| `cloud` | `shared/auth/cloud` | `authenticate`, `getSessionInfo`; sub-recordings `cloud/svcacct` (service-account JWT-bearer token) and `cloud/interactive` (authorization-code token) |
| `forgeops` | `shared/auth/forgeops` | `authenticate`, `getSessionInfo` for the realms in use; `forgeops/interactive` (the token IDM needs) |
| `classic` | `shared/auth/classic` | `authenticate` and a root-realm `getSessionInfo`; no oauth2 (classic has no IDM, so it never asks for a token) |

The mechanics — how the cassette is chosen, order-indexed matching, why routine recording never writes to it, the scope rewrite at replay, opting out — are described in the [frodo-lib guide](https://github.com/rockcarver/frodo-lib/blob/main/RECORD_REPLAY.md#shared-login-cassettes). What is specific to this repo:

- **A test's cassette is its connection's `type`** (see [How the harness works](#how-the-harness-works)). A test that has to bypass it — the invalid-credentials tests in `conn-test` and `config-manager-pull/push-test` — sets `FRODO_MOCK_DEDICATED_AUTH=1` for that one run and keeps its own login recording.
- **Each realm a test logs in to needs its own `getSessionInfo` entry.** They live in the same recording but have a different pathname per realm (`.../realms/root/realms/alpha/sessions/...`), so they don't collide. The forgeops cassette holds `root`, `alpha`, `alpha/bravo`, `root/realms/root` and `bravo`; the classic cassette holds only `root`. If a test needs a realm that has no entry, replay fails with a "recording not found" for that `getSessionInfo` call; add the entry by recording once with the refresh flag below.
- **Refreshing a cassette is deliberate.** An ordinary recording pass does its login live but does not record it; to (re)populate a cassette (a new realm, a scope change, expired entries) run one recording pass with `FRODO_MOCK_REFRESH_SHARED_AUTH=1`, for example `FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_MOCK_REFRESH_SHARED_AUTH=1 npm run test:update e2e/<file>`. The `tools/record-cloud-e2e.mjs` flag `--refresh-shared-auth` does this for the first file it records and then leaves the cassette alone. Refresh a cassette from **one** tenant only: it is order-indexed and shared by every test of its type, so mixing tenants (for example `frodo-dev` and `ccb-ai` for IGA) means whichever token sits at order 0 gets served to all of them, which has broken whole batches of unrelated tests in the past.
- **The forgeops and classic cassettes were seeded from the newest existing recordings**, not recorded from a fresh deployment, so their entries are older than cloud's; expect expiration warnings on them until they are refreshed against a live deployment.

## Expiration

Recordings expire after 90 days by default (`expiresIn`/`expiryStrategy` in frodo-lib's `SetupPollyForFrodoLib.ts`, backed by Polly's built-in expiration support — no custom code). An expired recording currently only warns (`expiryStrategy: warn`) rather than failing a replay run, so a stale fixture doesn't silently break CI or a contributor's local run; treat the warning as a prompt to re-record that fixture, not something to ignore indefinitely. Override with `FRODO_MOCK_EXPIRES_IN` (e.g. `30d`) and `FRODO_MOCK_EXPIRY_STRATEGY` (`record`/`warn`/`error`) if you need different behavior for a specific run.

## Re-recording individual tests

This is the common case, not the bulk tool below: a developer changes or adds one command, or notices an expiration warning (see Expiration above) on a handful of fixtures, and just needs to refresh those. It's the same manual flow as step 3–4 of Writing a test, aimed at an existing test file instead of a new one:

1. `FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update <pattern>` — re-records that test's own per-command HTTP traffic against your connection profile (`FRODO_HOST`/`FRODO_CONNECTION`, resolved by `TestConfig.js`'s `getEnv()`) and updates its snapshot in the same pass. `<pattern>` is a Jest test-path pattern (a substring match against the file path), not a glob.
2. `npm run test:only <pattern>` — validate it replays cleanly with no live network access.
3. Commit the test file (if changed) and the updated files under `test/e2e/mocks/`.

Sample commands:

```console
# Re-record one test file
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/conn-describe

# Re-record every test whose path starts with "conn-" in one pass
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/conn-

# Re-record, then verify the replay
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-list
npm run test:only e2e/agent-list
```

An ordinary pass like these leaves the shared login cassettes untouched (see [Shared login recordings](#shared-login-recordings)) — only that test's own per-command traffic is refreshed. A command has to exit successfully for its new recordings to be written, so if a re-record errors out partway (for example a scope error), nothing it captured is kept.

## Bulk-recording cloud tests

Reach for this only when many recordings need to move together at once — e.g. a change to frodo-lib's recording/matching logic that reshapes the whole cassette. A full cloud run touches hundreds of files and takes a long time, and (per below) can't fully cover the multi-phase destructive tests in one pass — for everyday changes, re-recording the individual test(s) above is faster and the more realistic workflow.

`npm run test:record:cloud` (`tools/record-cloud-e2e.mjs`) re-records every cloud-targeted test file (anything importing `connection`/`iga_connection` from `TestConfig.js`) serially against whatever profile `FRODO_CONNECTION` resolves to for that host — assumes you already have a working, saved connection profile for it (e.g. `frodo-dev`). Pass `--pattern <substring>` to narrow it to a subset, `--dry-run` to see which files it would touch without recording anything, or `--refresh-shared-auth` to also refresh the cloud login cassette during the first file's pass. It replaces the old fully-manual, one-file-at-a-time process; most of its work is re-recording per-command traffic rather than the login sequence, since the shared login cassette only needs refreshing on its own.

Not currently automated: classic and forgeops recordings, since both need their own local-infrastructure story (see below) rather than depending on an always-on external host; and multi-phase destructive tests like `agent-delete.e2e.test.js` (see below), which the tool detects and skips with a pointer to their own header comment.

## Multi-phase recording for destructive tests (import/delete pairs)

For tests that need setup (e.g. import an agent) before running, then teardown (delete it) after — following the frodo-lib `AgentOps.test.ts` pattern — use `beforeAll`/`afterAll` guarded by recording mode, not `beforeEach`/`afterEach`:

- **Recording mode**: `beforeAll` creates the fixture once, tests record their API calls against it, `afterAll` deletes it.
- **Replay mode**: no setup/teardown runs at all; tests replay the recorded HAR files directly.

Record each such test file individually:

```console
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-delete
FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update e2e/agent-web-delete
```

Then validate in replay mode:

```console
npm run test:only e2e/agent-delete
npm run test:only e2e/agent-web-delete
```

Import/delete only happening once per suite (not per test) avoids inter-test interference and keeps setup/cleanup out of replay mode entirely.

Setup helpers that only run in recording mode (like `utils/deleteAllTelemetry.cjs`, which resets the one-exporter-per-tenant telemetry state) make HTTP calls of their own. Those calls get recorded too, under a recording name derived from the script, and are never replayed; delete such a recording if one appears.

## Classic and ForgeOps

`classic_connection`/`forgeops_connection` in `TestConfig.js` currently point at specific external hosts (`openam-frodo-dev.classic.com`, `nightly.gcp.forgeops.com`) that this repo doesn't control the lifecycle of, so recording/regenerating those fixtures isn't as reproducible as cloud today. Recordings have also been made against other ForgeOps deployments; that works because matching ignores the host.

- **Classic**: a lightweight local docker-compose stack is a feasible follow-up (researched, not yet built) that would let classic recording work the same way cloud does above, without depending on an always-on external host.
- **ForgeOps**: needs a full Kubernetes-based local stack — a much larger undertaking. Not attempted yet; treat a reachable ForgeOps deployment as the only option until this is picked up.

Both types have shared login cassettes now (see [Shared login recordings](#shared-login-recordings)); only the bulk-recording automation is missing.

## Finding orphaned recordings

Recordings are never pruned automatically (frodo-lib keeps entries a recording session did not use, so recording one command never deletes what another session captured). Renaming a test, changing a command's flags, or changing what a command calls therefore leaves recordings behind that nothing replays. Find them by logging which recording files a full replay run actually opens:

1. Save the file-read logger from the [frodo-lib guide](https://github.com/rockcarver/frodo-lib/blob/main/RECORD_REPLAY.md#workflows) as an absolute-path script (call it `trace-reads.cjs`, logging to a file of your choice).
2. Run the whole suite with it preloaded. `--ci` keeps Jest from writing snapshots:
   ```console
   FRODO_TEST=1 NO_COLOR=1 \
   NODE_OPTIONS="--no-warnings --experimental-vm-modules --require /abs/path/trace-reads.cjs" \
   npx jest --ci --silent
   ```
3. Every `test/e2e/mocks/**/recording.har` that is not in the log was not read by that run.
4. Skipped tests read nothing, so their recordings would look orphaned. Repeat the run with the skips removed, then **restore the test files with git**:
   ```console
   perl -pi -e 's/\b(test|it|describe)\.skip\b/$1/g' test/e2e/*.test.js
   perl -pi -e 's/^export const testif = .*/export const testif = () => test;/' test/e2e/utils/TestUtils.js
   # ...run again with --ci, then:
   git checkout -- 'test/e2e/*.test.js' test/e2e/utils/TestUtils.js
   ```
   (Some un-skipped tests fail — that's expected, they were skipped for a reason; only the recordings they open matter.)
5. Classify what is left before deleting. Patterns that turned up when this was first done, roughly in order of how often:
   - **Superseded variants.** The command is still tested, but with different flags (a new global option changes every recording name), or the test now uses a `FRODO_TEST_NAME` label.
   - **Leftovers of a removed behavior.** For example per-test `/environment/scopes/service-accounts` lookups from before required scopes moved to a built-in catalog, or per-test `oauth2` files from before the shared cloud cassette.
   - **Names that only appear in a test file's header comment** (the recipe listing the recording commands) with no test behind them.
   - **Host-in-path names** (recorded with the host as a positional argument) that no current test produces.
   - **Recording-only setup traffic** (see the note under [Multi-phase recording](#multi-phase-recording-for-destructive-tests-importdelete-pairs)).
6. Be careful with anything **unread but produced by a current test**. A missing recording that a test needs fails the test, so an unread one is normally safe to remove; but a test can also pass without doing what it says (see [Writing a test](#writing-a-test)), and then the unread recording is the only evidence of a bug. Investigate those instead of deleting them.
7. Delete, run the full replay suite, and commit the deletion on its own so it is easy to review or revert.

## Known gaps

- **IGA workflow tests** recorded against `ccb-ai` (since `frodo-dev` has no IGA deployed) still hit real reliability issues unrelated to auth/scope: freshly-created custom workflows aren't always immediately readable/deletable, and the workflow publish endpoint's exact-body-match replay matching is fragile against large, deeply-nested workflow documents. Affected sub-tests are `test.skip()`'d with a `TODO(iga-ccb-ai-recording)` comment explaining the specific issue — see `iga-workflow-describe.e2e.test.js` for the fullest writeup.
- **`secretstore-mapping-delete.e2e.test.js`**: the first test is titled "should delete mapping in the ESV secret store" but its `CMD` runs `frodo secretstore mapping create`. The matching delete recording (`secretstore/mapping-delete/0_i_s`) is kept but never replayed. Fix the test to run `delete` (or rename it).
- **`config-manager-push-raw.e2e.test.js`**, ForgeOps `-p ... -D ... -m forgeops` variant: the test passes ("Raw config import completed") but the recorded `PUT /openidm/config/cluster` is never requested, unlike the cloud counterpart, which does read its `openidm` recording. It may be pushing nothing; worth checking whether the `-p` path resolves to a file.
- **Realm coverage of the shared cassettes** is whatever the current tests use (see [Shared login recordings](#shared-login-recordings)); a new test that logs in to a new realm needs its `getSessionInfo` entry recorded once.
