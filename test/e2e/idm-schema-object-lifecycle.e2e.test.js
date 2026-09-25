/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To record, run against the live frodo-dev tenant (uses your local
'openam-frodo-dev.forgeblocks.com' connection profile automatically, since
getEnv() switches to FRODO_CONNECTION in recording mode):

FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update -- e2e/idm-schema-object-lifecycle

This is a single, strictly sequential lifecycle: each step's fixture/state is
created by the step before it, and the suite is self-cleaning (the final two
steps delete the property and the type it created). If any step fails while
recording against the live tenant, run:

  frodo idm schema object delete -o alpha_frodoE2ETestWidget -y -F <host>

to manually clean up before re-recording. 'object create' is flags-only
(-o/--title/--icon, no file) -- every command in this family takes -o
explicitly.

Two pairs of steps intentionally use different flags for what would
otherwise be the exact same command ('property describe' before vs. after
the update; the final 'property list' vs. the two earlier ones): Polly's
recording bucket is keyed by the literal command line, and two invocations
of the identical command line expecting genuinely different recorded
responses (e.g. a property definition before vs. after an update, or a 200
vs. a 404) do not reliably replay in order. Varying an
otherwise-inconsequential flag (--json) gives each its own bucket instead.

This test exercises the 'frodo idm schema object [property]' commands
added for the tracker's managed-object schema CLI design, including
'object describe'/'object list'/'object update' -- it deliberately does not
create/delete a managed-object *record* of the new type, since no 'frodo'
CLI command for managed-object records exists yet (verified separately,
outside this suite, via frodo-lib directly against the live tenant).
Relationship-property commands ('frodo idm schema relationship ...') have
their own dedicated lifecycle test,
'idm-schema-relationship-lifecycle.e2e.test.js'.

'object delete' is the one exception to "every write here is recorded and
replayable": its PUT of the pruned whole 'managed' config back to the
server reproducibly recorded with no PUT entry captured at all (confirmed
via direct HAR inspection, twice, across independent live re-recordings),
even though the delete always completes correctly server-side. This is the
same underlying Polly recording-infrastructure issue already documented in
idm-schema-relationship-lifecycle.e2e.test.js, just triggered by this
endpoint's own response shape rather than by --reverse-property -- filed
as feedback, not chased further here. It runs live-only (skipped, and
unsnapshotted, during replay) for that reason; every other write in this
file records and replays cleanly.
*/
import {
  assertNoPollyReplayError,
  execWithRecordingProgress,
  getEnv,
  isRecordingMode,
  logRecordingProgress,
  verifyAuth,
} from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const isRecording = isRecordingMode();

const env = getEnv(c);

// A variant of env with FRODO_MOCK stripped, so calls bypass Polly
// entirely (live only) -- used only for 'object delete', see the header
// comment above.
const liveOnlyEnv = {
  env: Object.fromEntries(
    Object.entries(env.env).filter(([key]) => key !== 'FRODO_MOCK')
  ),
};

const type = 'alpha_frodoE2ETestWidget';

async function cleanUp() {
  try {
    await execWithRecordingProgress(
      `frodo idm schema object delete -o ${type} -y -F`,
      liveOnlyEnv,
      false
    );
  } catch {
    // Best-effort: the type may already be gone if the suite completed
    // normally, or never got created if it failed before step 1.
  }
}

describe('frodo idm schema object lifecycle (create type -> add property -> update property -> remove property -> delete type)', () => {
  beforeAll(async () => {
    if (isRecording) {
      logRecordingProgress('Verifying authentication before live lifecycle run');
      await verifyAuth(env);
    }
  });

  afterAll(async () => {
    if (isRecording) {
      logRecordingProgress('Ensuring the live tenant has no leftover test type');
      await cleanUp();
    }
  });

  test(`"frodo idm schema object create -o ${type} --title 'Frodo E2E Test Widget' -y": should create the new managed-object type`, async () => {
    const CMD = `frodo idm schema object create -o ${type} --title "Frodo E2E Test Widget" -y`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema object describe -o ${type} --json": should describe the new type's own metadata`, async () => {
    const CMD = `frodo idm schema object describe -o ${type} --json`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema object list": should include the new type in the tenant's type list`, async () => {
    const CMD = `frodo idm schema object list`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toContain(type);
    expect(assertNoPollyReplayError(stderr, CMD)).toBe('');
  });

  test(`"frodo idm schema object update -o ${type} --title 'Frodo E2E Test Widget (Updated)' -y": should update the type's title`, async () => {
    const CMD = `frodo idm schema object update -o ${type} --title "Frodo E2E Test Widget (Updated)" -y`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema object describe -o ${type}": should reflect the updated title`, async () => {
    const CMD = `frodo idm schema object describe -o ${type}`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema property list -o ${type}": should list the new type's base properties`, async () => {
    const CMD = `frodo idm schema property list -o ${type}`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema property create -o ${type} -p widgetSize --property-type number --title 'Widget Size' --user-editable": should add a new schema property`, async () => {
    const CMD = `frodo idm schema property create -o ${type} -p widgetSize --property-type number --title "Widget Size" --user-editable`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema property describe -o ${type} -p widgetSize": should describe the new property`, async () => {
    const CMD = `frodo idm schema property describe -o ${type} -p widgetSize`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema property update -o ${type} -p widgetSize --description '...' --searchable -y": should update the property, previewing current vs. proposed`, async () => {
    const CMD = `frodo idm schema property update -o ${type} -p widgetSize --description "The widget's size, updated by the lifecycle e2e test to add this description and make the property searchable." --searchable -y`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema property describe -o ${type} -p widgetSize --json": should reflect the updated property definition`, async () => {
    const CMD = `frodo idm schema property describe -o ${type} -p widgetSize --json`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema property delete -o ${type} -p widgetSize -y": should remove the property`, async () => {
    const CMD = `frodo idm schema property delete -o ${type} -p widgetSize -y`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema property list -o ${type}": should be back to only the base properties`, async () => {
    const CMD = `frodo idm schema property list -o ${type}`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  // -F/--force is required here even though this test never creates a
  // record: IDM's record-count index can briefly report a stale non-zero
  // count right after schema operations on a type, especially one reused
  // across many recording/replay runs like this fixture's own type name --
  // confirmed live, not a bug in the delete command. A real operator hits
  // this exact situation and has to pass --force too, so this is the
  // realistic path to test, not a workaround.
  //
  // Live-only, unsnapshotted: this specific write -- deleting the type,
  // which PUTs the whole pruned 'managed' config back -- reproducibly
  // recorded with no PUT/DELETE entry captured at all (confirmed via direct
  // HAR inspection after two independent live re-recordings), even though
  // the write itself always completes correctly server-side. Same
  // underlying Polly recording-infrastructure issue as the one already
  // documented and worked around in idm-schema-relationship-lifecycle.e2e.
  // test.js, just triggered by this endpoint's response shape/size rather
  // than by --reverse-property. Every other write in this file (object
  // create/update, property create/update/delete) records and replays
  // cleanly, so this is isolated to object delete specifically.
  test(`"frodo idm schema object delete -o ${type} -y -F" (live): should delete the managed-object type`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema object delete -o ${type} -y -F`;
    const { stderr } = await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    expect(stderr).toContain('Deleted');
    // Config removal is asynchronous by default (no waitForCompletion) --
    // same propagation-lag pattern documented in
    // idm-schema-relationship-lifecycle.e2e.test.js. Running this live
    // (bypassing Polly's own, much larger, incidental per-call overhead)
    // exposed the race directly: the very next step's live read could still
    // see the type as present without this settle delay.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });

  test(`"frodo idm schema property list -o ${type} --json": should fail, the type no longer exists`, async () => {
    const CMD = `frodo idm schema property list -o ${type} --json`;
    try {
      await execWithRecordingProgress(CMD, env, isRecording);
      throw new Error('Command should have failed with non-zero exit code');
    } catch (e) {
      if (e.message === 'Command should have failed with non-zero exit code') {
        throw e;
      }
      expect(e.code).not.toBe(0);
      expect(assertNoPollyReplayError(e.stderr, CMD)).toMatchSnapshot();
    }
  });
});
