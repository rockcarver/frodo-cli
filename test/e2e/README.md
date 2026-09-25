# E2E tests

frodo-cli's tests are e2e-only by deliberate choice: a CLI can only be properly tested by running the CLI, so these tests avoid anything in between — a mocked module, an imported command function, a harness that bypasses argument parsing — that would leave out real conditions or cut testing corners. Every test in this directory shells out to the `frodo` binary on `PATH` as a subprocess, exactly as a user would invoke it, and asserts on its stdout/stderr, usually via a snapshot. Worth calling out: there's also a hard technical constraint pointing the same direction — Jest's real-ESM mode (required by this project) can't load `@rockcarver/frodo-lib`'s built bundle, so no unit test could import a real `src/cli/**/*.ts` command file even if that were desired.

HTTP traffic from those subprocesses is recorded and replayed by [Polly.js](https://netflix.github.io/pollyjs/), wired up inside frodo-lib itself (`frodo-lib/src/utils/SetupPollyForFrodoLib.ts`), not by the Jest harness. Recordings live under `test/e2e/mocks/` as HAR fixtures and are committed to the repo.

## Modes

Controlled by the `FRODO_MOCK` env var, read at process start by the `frodo` binary:

| `FRODO_MOCK` | Behavior |
| --- | --- |
| unset | Real network calls, no mocking. Only useful when deliberately hitting a live tenant outside of a test. |
| `1` | Replay mode. Requests are matched against existing recordings; a miss fails with `Recording for the following request is not found`. This is what `npm run test:only`/`test:serial` use by default — each test file sets `process.env['FRODO_MOCK'] ||= '1'` itself, so an external `FRODO_MOCK=record` (from `npm run test:record:cloud` or a manual invocation) still overrides it. |
| `record` | Record mode. Requests hit the real network and responses are persisted as new/updated recordings. |

Other relevant env vars: `FRODO_NO_CACHE=1` disables frodo's on-disk token cache so a command actually re-authenticates instead of reusing a cached token — always set this when recording, otherwise the oauth2/authenticate calls you're trying to capture may never happen. `FRODO_TEST_NAME` sets a test's recording identity explicitly instead of letting Polly derive one from argument count and flags — see Writing a test below; both the recording pass and every replay of that test must set it to the same value. `FRODO_HOST`/`FRODO_CONNECTION` and, in replay mode, `FRODO_USERNAME`/`FRODO_PASSWORD`/`FRODO_SA_ID`/`FRODO_SA_JWK`/`FRODO_AMSTER_PRIVATE_KEY` are set per test file by `test/e2e/utils/TestUtils.js`'s `getEnv()`, sourced from the fixed set of test identities in `test/e2e/utils/TestConfig.js` (`connection`/`iga_connection` for cloud, `classic_connection`, `forgeops_connection`, `amster_connection`).

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

**Fallback (existing tests, not recommended for new ones).** If `FRODO_TEST_NAME` is unset, Polly derives an identity from the command's argument count and flags instead. Most of the existing suite was recorded this way, and it still works — but it means two test cases with identical arguments silently collide, and it's the reason older test files carry a hand-maintained comment block listing every exact recording command, so a human can eyeball that no two are alike. Prefer setting `FRODO_TEST_NAME` explicitly on every new test instead of relying on this.

## Shared login recording

As of this pass, the login/session-bootstrap sequence (`/am/oauth2/*`, `/am/json/*/authenticate`, and the `getSessionInfo` call right after it) is recorded under one fixture (`shared/auth`, under `test/e2e/mocks/shared_*/auth_*/`) for cloud hosts, not per test. Every cloud test that logs in replays that same fixture instead of carrying its own copy of the login sequence. Everything else — the actual command behavior under test — is still recorded per test file as before. Classic and forgeops hosts are untouched by this — they keep the original per-command recording name, since they don't yet have a live re-recording story to repopulate a shared cassette (see below).

**Deliberately not keyed by host.** No recording name anywhere in this project encodes hostname, and request matching already ignores it (`authenticationMatchRequestsBy()`'s `hostname: false`) — this is intentional, existing project convention: a recording made against one PingOne AIC dev tenant (e.g. `volker-dev`) is expected to replay fine against another (e.g. `frodo-dev`), since different developers routinely use different tenants day to day. The shared login fixture follows that same convention.

**Split by grant type.** `/am/oauth2/access_token` is hit by two unrelated flows that share the exact same pathname: the service account's JWT-bearer grant, and the interactive/browser authorization-code grant. Since matching ignores the request body (it's dynamic — a fresh JWT or PKCE verifier every call), these would silently overwrite each other in the same slot. `SetupPollyForFrodoLib.ts` inspects the request body for `client_id=service-account` and routes the recording to `shared/auth/svcacct` or `shared/auth/interactive` accordingly — this is why the shared fixture has two sub-recordings, not one.

Practical consequence: a test file's own recording no longer needs to contain a login sequence at all, but the shared fixture does need to exist and stay valid for whichever credential type (and realm — see below) a test actually uses.

**Writing to the shared cassette is opt-in, not automatic.** An ordinary recording pass (`FRODO_MOCK=record`, no extra flags) authenticates for real as usual, but its auth exchange is captured into a disposable per-command bucket instead of the shared one — the shared fixture is left untouched. This is deliberate: the shared cassette is order-indexed and shared across *every* cloud host's tests, so overwriting one entry in it during an unrelated recording pass can silently break every other test relying on a different entry at that same order position (confirmed directly — recording one command against a different credential shape shifted which `shared/auth/svcacct` entry a whole batch of unrelated IGA tests replayed against, breaking all of them, twice, in the same session). To deliberately (re)populate or refresh the shared fixture — e.g. bootstrapping it for a host/credential combination that's never needed it before, or after a scope change — set `FRODO_MOCK_REFRESH_SHARED_AUTH=1` alongside `FRODO_MOCK=record` for that one recording pass. `tools/record-cloud-e2e.mjs`'s `--refresh-shared-auth` flag does this automatically for the first file it records, then leaves the cassette alone for the rest of the run.

**Realm-scoped session checks aren't part of the collision above** — `getSessionInfo` calls scoped to a specific realm (e.g. `.../realms/root/realms/alpha/sessions/...`) have a different pathname per realm, so they coexist in the shared fixture without any special handling; they just need to actually have been recorded once for whichever realm(s) your tests touch. **A command must exit successfully for Polly to flush newly-recorded entries to disk** — if it errors out partway (e.g. a scope error, see below), any entries it would have added are lost even though the live HTTP calls happened.

**Order position contention across hosts/credentials.** Because matching ignores both hostname and body, disambiguation within the shared cassette happens *only* by which occurrence (order 0, 1, 2, …) a given test's own process asks for — and a single-command test's first (and usually only) `/oauth2/access_token` call always asks for order 0. If the shared cassette has ever been refreshed against more than one real tenant (e.g. `frodo-dev` for most tests, `ccb-ai` for IGA, since `frodo-dev` has no IGA deployed), whichever tenant's token happens to sit at order 0 gets served to *every* order-0-consuming test, regardless of which tenant it actually targets — confirmed directly, twice, when refreshing the cassette against one host silently broke a whole batch of unrelated tests targeting the other. This is why `FRODO_MOCK_REFRESH_SHARED_AUTH` exists (see above) — routine recording no longer touches the cassette at all, so this can now only happen during a deliberate refresh.

**Scope claims are rewritten dynamically, not baked into the fixture.** The cached token's `scope` field doesn't need to match what a real tenant actually granted — `SetupPollyForFrodoLib.ts` has a `beforeReplay` hook on `/am/oauth2/access_token` that overwrites the cached response's `scope` with whatever the *current* request actually asked for (read directly off the svcacct grant's own `scope=` body param, or — for the interactive grant, which doesn't repeat scope at the token-exchange step — captured from the preceding `/oauth2/authorize` call in the same process). This makes `assertHasRequiredScope()` (`RequiredScopesOps.ts`) checks pass for whatever scope frodo's own code decided to request, automatically, for any current or future scope need, with no fixture content to hand-maintain. Verified directly: the cassette's stored scope can be narrowed to almost nothing and every scope-sensitive test still passes, purely from the rewrite.

### Known gaps (as of this pass)

- Some realm-scoped `getSessionInfo` variants (beyond the root realm) haven't been recorded yet for the interactive credential.
- IGA workflow tests recorded against `ccb-ai` (since `frodo-dev` has no IGA deployed) still hit real reliability issues unrelated to auth/scope: freshly-created custom workflows aren't always immediately readable/deletable, and the workflow publish endpoint's exact-body-match replay matching is fragile against large, deeply-nested workflow documents. Affected sub-tests are `test.skip()`'d with a `TODO(iga-ccb-ai-recording)` comment explaining the specific issue — see `iga-workflow-describe.e2e.test.js` for the fullest writeup.

## Expiration

Recordings expire after 90 days by default (`expiresIn`/`expiryStrategy` in `SetupPollyForFrodoLib.ts`, backed by Polly's built-in expiration support — no custom code). An expired recording currently only warns (`expiryStrategy: warn`) rather than failing a replay run, so a stale fixture doesn't silently break CI or a contributor's local run; treat the warning as a prompt to re-record that fixture, not something to ignore indefinitely. Override with `FRODO_MOCK_EXPIRES_IN` (e.g. `30d`) and `FRODO_MOCK_EXPIRY_STRATEGY` (`record`/`warn`/`error`) if you need different behavior for a specific run.

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

An ordinary pass like these leaves the shared login fixture untouched (see Shared login recording above) — only that test's own per-command traffic is refreshed. If the shared fixture itself needs refreshing (bootstrapping a host/credential combination it's never carried before, or after a scope change), add `FRODO_MOCK_REFRESH_SHARED_AUTH=1` to the command, once.

## Bulk-recording cloud tests

Reach for this only when many recordings need to move together at once — e.g. a change to `SetupPollyForFrodoLib.ts`'s recording/matching logic that reshapes the whole cassette. A full cloud run touches hundreds of files and takes a long time, and (per below) can't fully cover the multi-phase destructive tests in one pass — for everyday changes, re-recording the individual test(s) above is faster and the more realistic workflow.

`npm run test:record:cloud` (`tools/record-cloud-e2e.mjs`) re-records every cloud-targeted test file (anything importing `connection`/`iga_connection` from `TestConfig.js`) serially against whatever profile `FRODO_CONNECTION` resolves to for that host — assumes you already have a working, saved connection profile for it (e.g. `frodo-dev`). Pass `--pattern <substring>` to narrow it to a subset, or `--dry-run` to see which files it would touch without recording anything. It replaces the old fully-manual, one-file-at-a-time process; after it lands, most of its work is re-recording per-command traffic rather than the login sequence, since the shared login fixture only needs refreshing on its own.

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

## Classic and ForgeOps

`classic_connection`/`forgeops_connection` in `TestConfig.js` currently point at specific external hosts (`openam-frodo-dev.classic.com`, `nightly.gcp.forgeops.com`) that this repo doesn't control the lifecycle of, so recording/regenerating those fixtures isn't as reproducible as cloud today.

- **Classic**: a lightweight local docker-compose stack is a feasible follow-up (researched, not yet built) that would let classic recording work the same way cloud does above, without depending on an always-on external host.
- **ForgeOps**: needs a full Kubernetes-based local stack — a much larger undertaking. Not attempted yet; treat `forgeops_connection`'s current external host as the only option until this is picked up.
