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
 * The entity picker runner on a real terminal (decision record 0038, and the
 * rules that keep a pick from asking for what the command line answers).
 * `frodo script describe` takes one of -n and -i, and both have a picker
 * (the script family of EntityPickFamilies.ts): the user chooses which one in
 * the resolution pass, and after login gets the picker for that one, once.
 * Logins and the script list go to a fake AM.
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

suite('the script picker, on a real terminal', () => {
  let home;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = createShellTestHome();
    fakeAm = await startFakeAm({
      journey: 'password',
      scripts: ['zion-check', 'matrix-check'],
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  /**
   * `script describe` on the fake AM; `choose` are the keys after the one-of
   * menu opened. The picker needs the login, which the pass makes; the Ready
   * step follows it and is answered with Run.
   */
  function describeScript(choose) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: [
        'script',
        'describe',
        `http://127.0.0.1:${fakeAm.port}/am`,
        '/',
        '--type',
        'classic',
      ],
      actions: [
        { type: 'wait_plain', regex: 'Choose which script', timeoutMs: 30000 },
        { type: 'sleep', ms: 400 },
        ...choose,
        { type: 'key', name: 'enter' },
        {
          type: 'wait_plain',
          regex: 'Select script to act on',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'picker' },
        { type: 'clear_output' },
        { type: 'key', name: 'enter' },
        ...answerReady(),
        { type: 'sleep', ms: 3000 },
        { type: 'capture', label: 'after' },
      ],
    });
  }

  /** The picker as last drawn: a capture holds every frame since the last clear. */
  const lastFrame = (plain) => plain.split('┌ Navigate').pop();
  const footer = (frame) => frame.split('└').pop();
  /** Once the answer is given, the output holds the answered line of the picker and no second picker. */
  const askedOnce = (plain) =>
    plain.match(/Select script to act on/g)?.length === 1 &&
    plain.includes('✔ Select script to act on');

  test('the name the user chose is the one that is picked, once', () => {
    const run = describeScript([]);
    const picker = lastFrame(run.captures.picker.plain);
    expect(picker).toContain('zion-check');
    expect(picker).toContain('matrix-check');
    // the footer is the command as the pick would leave it: with --script-name
    expect(footer(picker)).toContain('--script-name zion-check');
    expect(footer(picker)).not.toContain('--script-id');
    // no second picker after the answer
    expect(askedOnce(run.captures.after.plain)).toBe(true);
  });

  test('the id the user chose is the one that is picked, once', () => {
    const run = describeScript([{ type: 'key', name: 'down' }]);
    const picker = lastFrame(run.captures.picker.plain);
    expect(picker).toContain('zion-check');
    expect(footer(picker)).toContain('--script-id 00000001-');
    expect(footer(picker)).not.toContain('--script-name');
    expect(askedOnce(run.captures.after.plain)).toBe(true);
  });
  test('a delete of everything, chosen in the one-of menu, is not turned into a picker for one script', () => {
    const run = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: [
        'script',
        'delete',
        `http://127.0.0.1:${fakeAm.port}/am`,
        '/',
        '--type',
        'classic',
      ],
      actions: [
        {
          type: 'wait_plain',
          regex: 'Choose what to delete',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'menu' },
        // the first row is -a
        { type: 'key', name: 'enter' },
        ...answerReady(),
        // the question about all scripts follows the login; a picker would come before it
        {
          type: 'wait_plain',
          regex: 'Continue\\? \\(y/N\\)',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'after' },
        { type: 'key', name: 'escape' },
        { type: 'sleep', ms: 500 },
      ],
    });
    expect(run.captures.menu.plain).toContain('-a, --all');
    expect(run.captures.after.plain).not.toContain('Select script to act on');
    // what follows the login is the question about all scripts
    expect(run.captures.after.plain).toContain(
      'Delete all non-default scripts'
    );
  });
});
