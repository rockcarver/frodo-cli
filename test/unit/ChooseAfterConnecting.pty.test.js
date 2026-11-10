import cp from 'child_process';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { answerReady } from '../utils/ReadyStep.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * "Choose after connecting": on the options page, <enter> on an empty value of
 * an option that names an entity marks it without a value, and the picker for
 * it opens after login. It is for the options whose picker does not open by
 * itself because the command line is complete without them
 * (`journey describe`: no -i describes every journey). Before, the value box
 * took free text only, ignored an empty <enter>, and there was no way to ask for
 * the picker: the host has to be chosen first, and the picker needs the host.
 * Logins and the journey list go to a fake AM, which does not serve the trees
 * themselves: the command fails reading the picked journey, after it was picked.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: 'someone',
  FRODO_PASSWORD: 'not-a-password',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

suite('choose after connecting, on a real terminal', () => {
  let home;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });
  beforeEach(async () => {
    home = createShellTestHome();
    fakeAm = await startFakeAm({
      journey: 'password',
      trees: ['zion-login', 'matrix-login'],
    });
  });
  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  // `-i` is the third row of the options page of `journey describe`
  const toJourneyId = [
    { type: 'key', name: 'down' },
    { type: 'key', name: 'down' },
  ];

  /** `journey describe` with --prompt on the fake AM: the options page opens last. */
  function describeJourney(actions) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: [
        'journey',
        'describe',
        `http://127.0.0.1:${fakeAm.port}/am`,
        '/',
        '--type',
        'classic',
        '--prompt',
      ],
      actions: [
        {
          type: 'wait_plain',
          regex: "Optional options for 'describe'",
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 500 },
        ...actions,
      ],
    });
  }

  const lastFrame = (plain) => plain.split('┌ Navigate').pop();
  const footer = (frame) => frame.split('└').pop();

  test('the value box offers it, and an empty <enter> marks the option without a value', () => {
    const run = describeJourney([
      ...toJourneyId,
      { type: 'key', name: 'space' },
      { type: 'sleep', ms: 700 },
      { type: 'capture', label: 'box' },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
      { type: 'sleep', ms: 700 },
      { type: 'capture', label: 'marked' },
    ]);
    const box = run.captures.box.plain;
    expect(box).toContain(
      '(type a value, or press ENTER to choose it after connecting)'
    );
    expect(box).toMatch(/\[ENTER\] choose after connecting/);
    // the value box is closed, the option is marked, nothing was committed
    const marked = lastFrame(run.captures.marked.plain);
    expect(marked).not.toContain('Value for');
    expect(marked).toMatch(/◉ › -i, --journey-id <journey>/);
    expect(footer(marked)).not.toContain('--journey-id matrix');
  });

  test('after login the picker opens, once, and the command runs for the journey picked', () => {
    const run = describeJourney([
      ...toJourneyId,
      { type: 'key', name: 'space' },
      { type: 'key', name: 'enter' },
      { type: 'sleep', ms: 500 },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' }, // commit the options page
      // the Ready step is the last prompt of the pass; the picker needs the login
      { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
      { type: 'sleep', ms: 400 },
      { type: 'capture', label: 'ready' },
      { type: 'key', name: 'enter' },
      {
        type: 'wait_plain',
        regex: 'Select journey to act on',
        timeoutMs: 30000,
      },
      { type: 'sleep', ms: 500 },
      { type: 'capture', label: 'picker' },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
      { type: 'sleep', ms: 3000 },
      { type: 'capture', label: 'after' },
    ]);
    // the step says that a pick is still open, and the picker comes after it
    expect(lastFrame(run.captures.ready.plain)).toContain(
      'chosen from the target system after login'
    );
    const picker = lastFrame(run.captures.picker.plain);
    expect(picker.indexOf('matrix-login')).toBeGreaterThan(-1);
    expect(picker.indexOf('matrix-login')).toBeLessThan(
      picker.indexOf('zion-login')
    );
    expect(footer(picker)).toContain('--journey-id matrix-login');
    // asked once, and not as free text before it
    expect(run.captures.picker.plain).not.toContain('Enter a value for');
    expect(
      run.captures.after.plain.match(/Select journey to act on/g)
    ).toHaveLength(1);
    expect(run.captures.after.plain).toContain('journey matrix-login');
  });

  test('without the mark, the command is complete and no picker opens', () => {
    const run = describeJourney([
      { type: 'key', name: 'enter' }, // commit the options page, nothing marked
      { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
      { type: 'sleep', ms: 400 },
      { type: 'capture', label: 'ready' },
      { type: 'key', name: 'enter' },
      { type: 'sleep', ms: 4000 },
      { type: 'capture', label: 'after' },
    ]);
    // nothing is open for after login: the step does not say so
    expect(lastFrame(run.captures.ready.plain)).not.toContain('after login');
    expect(run.captures.after.plain).not.toContain('Select journey to act on');
  });

  test('a value typed in the box is used as it is, and no picker opens', () => {
    const run = describeJourney([
      ...toJourneyId,
      { type: 'key', name: 'space' },
      { type: 'send', text: 'zion-login' },
      { type: 'key', name: 'enter' },
      { type: 'sleep', ms: 500 },
      { type: 'key', name: 'enter' }, // commit the options page
      ...answerReady(),
      { type: 'sleep', ms: 4000 },
      { type: 'capture', label: 'after' },
    ]);
    expect(run.captures.after.plain).not.toContain('Select journey to act on');
    expect(run.captures.after.plain).toContain('journey zion-login');
  });

  test('unmarking it again forgets the request', () => {
    const run = describeJourney([
      ...toJourneyId,
      { type: 'key', name: 'space' },
      { type: 'key', name: 'enter' }, // marked for later
      { type: 'sleep', ms: 500 },
      { type: 'key', name: 'space' }, // unmarked
      { type: 'sleep', ms: 500 },
      { type: 'key', name: 'enter' }, // commit the options page
      ...answerReady(),
      { type: 'sleep', ms: 4000 },
      { type: 'capture', label: 'after' },
    ]);
    expect(run.captures.after.plain).not.toContain('Select journey to act on');
  });
});
