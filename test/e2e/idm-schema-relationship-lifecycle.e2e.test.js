/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To record, run against the live frodo-dev tenant (uses your local
'openam-frodo-dev.forgeblocks.com' connection profile automatically, since
getEnv() switches to FRODO_CONNECTION in recording mode):

FRODO_MOCK=record FRODO_NO_CACHE=1 npm run test:update -- e2e/idm-schema-relationship-lifecycle

This is a single, strictly sequential lifecycle covering both single-side
and bidirectional relationship properties, spanning two disposable
managed-object types (A and B). If any step fails while recording against
the live tenant, run:

  frodo idm schema object delete -o alpha_frodoE2ERelTestA -y -F <host>
  frodo idm schema object delete -o alpha_frodoE2ERelTestB -y -F <host>

to manually clean up before re-recording.

Type A/B setup and teardown ('object create'/'object delete') are
deliberately NOT recorded Polly-backed test steps here -- they run as
plain live calls (FRODO_MOCK stripped from the child env, bypassing Polly
entirely) in beforeAll/afterAll, gated to recording mode only. Both
commands already have dedicated, snapshot-verified coverage in
idm-schema-object-lifecycle.e2e.test.js, which uses the exact same command
shape (-o/--title/-y and -o/-y/-F respectively) for its own disposable
type. Since Polly's FSPersister replaces a bucket's persisted recording
wholesale on every new invocation rather than merging entries, two
different e2e test files recording against that identical shape --
whichever type name they use -- would silently clobber each other's
fixtures (confirmed the hard way while building this suite). Only
relationship-specific commands, which no other suite touches, are recorded
here.

Every relationship *mutation* verb (create, update, delete -- both
single-side and bidirectional) is live-only, unlike the describe/list
verbs in this suite: recording any of them under FRODO_MOCK=record hangs
or is extremely slow to persist (confirmed both ways -- a first attempt
recording only the bidirectional writes hung outright with no timeout at
all when reproduced outside jest; a later attempt recording the
single-side writes too didn't hang forever, but each one took 10+ minutes
to actually return while jest's 120s per-test timeout killed the test
long before that, even though the write itself completed correctly
server-side within seconds of the CLI call returning control). The
mutating PUT/DELETE response for this specific IDM v2 relationship-schema
endpoint appears to be the trigger, regardless of single- vs.
bidirectional-ness. This looks like a genuine Polly/frodo-lib
recording-infrastructure bug specific to this response shape, not a bug in
the relationship commands themselves -- filed as feedback, not chased
further here. Every describe/list verb (including the bidirectional
--with-reverse describe, and the follow-up describe/list steps confirming
a live create/update/delete took effect) remains fully
recorded/snapshotted/replayable below, so replay-mode coverage isn't lost,
just the six write verbs' own raw stdout snapshots.

The bidirectional pair below creates the forward property as --single
(not --many), with a --reverse-many auto-created reverse side, rather than
the other way around. This was not a stylistic choice: forward --many
combined with any --reverse-* auto-create combination reliably 400s
against this frodo-dev tenant specifically ("Invalid relationship
schema", no further detail), across every payload shape tried (including a
byte-for-byte clone of a captured, working browser-UI request). The exact
same frodo-cli code, unmodified, was cross-checked live against a second
tenant (volker-dev) and succeeded there for all four forward/reverse
single/many combinations -- confirming this is a frodo-dev-specific
environment/version difference, not a bug in the relationship commands.
Forward --single (with either --reverse-single or --reverse-many) works
fine on frodo-dev, so that's what this suite exercises; it still creates a
genuine bidirectional many-relationship, just anchored from the single
side.

Several pairs of steps intentionally vary an otherwise-inconsequential flag
(--json) for what would otherwise be the exact same command line, since
Polly's recording bucket is keyed by the literal command line and two
invocations expecting genuinely different responses (e.g. a property
definition before vs. after an update) don't reliably replay in order --
same convention as idm-schema-object-lifecycle.e2e.test.js. "describe"/
"list" only take -o/-p/--json, though, so a *third* same-shape invocation
(one no-flags "describe -o -p" and one no-flags "list -o", each needed
twice for genuinely different expected content) has no flag left to vary.
Those two extra invocations are live-only and lightly asserted (not
snapshotted) instead, for the same underlying reason as the write verbs --
Polly's FSPersister replaces a bucket's HAR wholesale on each new
recording invocation, so the later of a same-shape pair would otherwise
silently clobber the earlier one's fixture.
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

// A variant of env with FRODO_MOCK stripped, so type A/B setup/teardown
// calls bypass Polly entirely (live only) instead of writing into a Polly
// bucket shared with idm-schema-object-lifecycle.e2e.test.js -- see the
// header comment above.
const liveOnlyEnv = {
  env: Object.fromEntries(
    Object.entries(env.env).filter(([key]) => key !== 'FRODO_MOCK')
  ),
};

const typeA = 'alpha_frodoE2ERelTestA';
const typeB = 'alpha_frodoE2ERelTestB';

async function setUp() {
  await execWithRecordingProgress(
    `frodo idm schema object create -o ${typeA} --title "Frodo E2E Rel Test A" -y`,
    liveOnlyEnv,
    false
  );
  await execWithRecordingProgress(
    `frodo idm schema object create -o ${typeB} --title "Frodo E2E Rel Test B" -y`,
    liveOnlyEnv,
    false
  );
  // Config writes are asynchronous by default (no waitForCompletion) --
  // confirmed elsewhere this session (see the tracker's "Schema-write
  // questions" concurrency finding) and reproduced directly here: the first
  // relationship create referencing type B's resourceCollection path failed
  // live with a 400 ("field is invalid") when it ran immediately after
  // setUp(), because type B's schema hadn't finished propagating yet. No
  // documented SLA exists for this propagation, and it's been observed to
  // vary run to run (5s was enough most of the time, but not always) -- this
  // settle delay reduces, but may not fully eliminate, that race.
  await new Promise((resolve) => setTimeout(resolve, 10000));
}

async function cleanUp() {
  try {
    await execWithRecordingProgress(
      `frodo idm schema object delete -o ${typeA} -y -F`,
      liveOnlyEnv,
      false
    );
  } catch {
    // Best-effort: the type may already be gone if the suite completed
    // normally, or never got created if setUp failed.
  }
  try {
    await execWithRecordingProgress(
      `frodo idm schema object delete -o ${typeB} -y -F`,
      liveOnlyEnv,
      false
    );
  } catch {
    // Same as above, for type B.
  }
}

describe('frodo idm schema relationship lifecycle (single-side, then bidirectional across two types)', () => {
  beforeAll(async () => {
    if (isRecording) {
      logRecordingProgress(
        'Verifying authentication before live relationship lifecycle run'
      );
      await verifyAuth(env);
      logRecordingProgress('Creating disposable types A and B (live, unrecorded)');
      await setUp();
    }
  });

  afterAll(async () => {
    if (isRecording) {
      logRecordingProgress('Deleting disposable types A and B (live, unrecorded)');
      await cleanUp();
    }
  });

  test(`"frodo idm schema relationship create -o ${typeA} -p singleLinkB --target-object ${typeB} --single --query-fields name" (live): should create a single-side relationship property`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship create -o ${typeA} -p singleLinkB --target-object ${typeB} --single --query-fields name`;
    await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  // Live-only, unsnapshotted (not because of the recording-hang issue --
  // this is a plain read -- but because "describe -o <type> -p <prop>" with
  // no other flags is also the exact shape used a few steps down by
  // "describe -o typeB -p bidiLinkedAs", and Polly's FSPersister replaces a
  // bucket's persisted HAR wholesale on each new recording invocation (see
  // the header comment), so two same-shape describes recording different
  // expected content silently clobber each other. That later describe is
  // the more valuable one to keep fully recorded (it's the only check that
  // a live bidirectional update actually propagated to the reverse side),
  // so this earlier, more redundant one (existence right after create,
  // already re-verified by the --json describe two steps down) is the one
  // that gives way here.
  test(`"frodo idm schema relationship describe -o ${typeA} -p singleLinkB" (live): should describe the new relationship property`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship describe -o ${typeA} -p singleLinkB`;
    const { stdout } = await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    expect(stdout).toContain('singleLinkB');
  });

  test(`"frodo idm schema relationship list -o ${typeA}": should list the single-side relationship property`, async () => {
    const CMD = `frodo idm schema relationship list -o ${typeA}`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema relationship update -o ${typeA} -p singleLinkB --title 'Linked B (Updated)' -y" (live): should update the relationship property's title`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship update -o ${typeA} -p singleLinkB --title "Linked B (Updated)" -y`;
    await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  test(`"frodo idm schema relationship describe -o ${typeA} -p singleLinkB --json": should reflect the updated title`, async () => {
    const CMD = `frodo idm schema relationship describe -o ${typeA} -p singleLinkB --json`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema relationship delete -o ${typeA} -p singleLinkB -y" (live): should delete the single-side relationship property`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship delete -o ${typeA} -p singleLinkB -y`;
    await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  test(`"frodo idm schema relationship list -o ${typeA} --json": should be back to no relationship properties`, async () => {
    const CMD = `frodo idm schema relationship list -o ${typeA} --json`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema relationship create -o ${typeA} -p bidiLinkedB --target-object ${typeB} --single --query-fields name --reverse-property bidiLinkedAs --reverse-many --reverse-query-fields name" (live): should create a bidirectional relationship, auto-creating the reverse side on type B`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship create -o ${typeA} -p bidiLinkedB --target-object ${typeB} --single --query-fields name --reverse-property bidiLinkedAs --reverse-many --reverse-query-fields name`;
    await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  test(`"frodo idm schema relationship describe -o ${typeA} -p bidiLinkedB --with-reverse --json": should describe both sides of the bidirectional relationship`, async () => {
    const CMD = `frodo idm schema relationship describe -o ${typeA} -p bidiLinkedB --with-reverse --json`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema relationship update -o ${typeA} -p bidiLinkedB --description 'Bidirectional link' --with-reverse -y" (live): should update both sides of the bidirectional relationship`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship update -o ${typeA} -p bidiLinkedB --description "Bidirectional link" --with-reverse -y`;
    await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  test(`"frodo idm schema relationship describe -o ${typeB} -p bidiLinkedAs": should reflect the update on the reverse side`, async () => {
    const CMD = `frodo idm schema relationship describe -o ${typeB} -p bidiLinkedAs`;
    const { stdout, stderr } = await execWithRecordingProgress(CMD, env, isRecording);
    expect(assertNoPollyReplayError(stdout, CMD)).toMatchSnapshot();
    expect(assertNoPollyReplayError(stderr, CMD)).toMatchSnapshot();
  });

  test(`"frodo idm schema relationship delete -o ${typeA} -p bidiLinkedB --with-reverse -y" (live): should delete both sides of the bidirectional relationship`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship delete -o ${typeA} -p bidiLinkedB --with-reverse -y`;
    await execWithRecordingProgress(CMD, liveOnlyEnv, true);
  });

  // Live-only, unsnapshotted for the same bucket-collision reason as the
  // "describe" step above: "list -o <type>" with no other flags is also the
  // exact shape of the very first "list -o typeA" step, and that one -- the
  // only one of the pair that shows a real property present rather than an
  // empty list -- is the more valuable one to keep fully recorded.
  test(`"frodo idm schema relationship list -o ${typeB}" (live): should show no leftover relationship properties on type B`, async () => {
    if (!isRecording) return;
    const CMD = `frodo idm schema relationship list -o ${typeB}`;
    const { stdout } = await execWithRecordingProgress(CMD, liveOnlyEnv, true);
    expect(stdout).not.toContain('bidiLinkedAs');
  });
});
