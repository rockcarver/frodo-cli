import cp from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { answerReady } from '../utils/ReadyStep.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);

/**
 * `frodo journey validate` needs to be told which journeys to validate: -i, -a
 * or -A. It used to check that by hand after login, so a person who chose the
 * host in the interactive flow got "Specify -i or -a" and no way to say which.
 * The command now declares the selector (a one-of group), so the framework asks
 * for it, offers a picker over the journeys of the tenant for -i (decision
 * record 0038), and fails with the standard message when nobody can be asked.
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

suite('journey validate, on a real terminal', () => {
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

  /**
   * `journey validate` on the fake AM with no selector; `choose` are the keys
   * after the menu opened. The journey picker needs the login, which the pass
   * makes, so it follows the menu and comes before the Ready step; `after`
   * is what the scenario does from there.
   */
  function validate(choose, after) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: [
        'journey',
        'validate',
        `http://127.0.0.1:${fakeAm.port}/am`,
        '/',
        '--type',
        'classic',
      ],
      actions: [
        {
          type: 'wait_plain',
          regex: 'Choose which journeys to validate',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'menu' },
        { type: 'clear_output' },
        ...choose,
        { type: 'key', name: 'enter' },
        ...after,
      ],
    });
  }

  const lastFrame = (plain) => plain.split('┌ Navigate').pop();
  const footer = (frame) => frame.split('└').pop();

  test('asks which journeys to validate, with the three ways to say it', () => {
    const run = validate(
      [],
      [
        {
          type: 'wait_plain',
          regex: 'Select journey to act on',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'picker' },
        { type: 'key', name: 'enter' },
        ...answerReady(),
      ]
    );
    const menu = lastFrame(run.captures.menu.plain);
    expect(menu).toContain('-i, --journey-id');
    expect(menu).toContain('-a, --all');
    expect(menu).toContain('-A, --all-separate');
    // the command as it stands, before the choice
    expect(footer(menu)).toContain('frodo journey validate http://127.0.0.1:');
    expect(footer(menu)).not.toContain('--journey-id');
  });

  test('-i opens a picker over the journeys of the tenant, in order, and runs with the one picked', () => {
    const run = validate(
      [],
      [
        {
          type: 'wait_plain',
          regex: 'Select journey to act on',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'picker' },
        { type: 'clear_output' },
        { type: 'key', name: 'enter' },
        ...answerReady(),
        { type: 'sleep', ms: 3000 },
        { type: 'capture', label: 'after' },
      ]
    );
    const picker = lastFrame(run.captures.picker.plain);
    expect(picker.indexOf('matrix-login')).toBeGreaterThan(-1);
    expect(picker.indexOf('matrix-login')).toBeLessThan(
      picker.indexOf('zion-login')
    );
    expect(footer(picker)).toContain('--journey-id matrix-login');
    // it ran for the journey that was picked
    expect(run.captures.after.plain).toContain("journey 'matrix-login'");
  });

  test('-a asks for no journey', () => {
    const run = validate(
      [{ type: 'key', name: 'down' }],
      [
        ...answerReady(),
        { type: 'sleep', ms: 3500 },
        { type: 'capture', label: 'after' },
      ]
    );
    expect(run.captures.after.plain).not.toContain('Select journey to act on');
    expect(run.captures.after.plain).toContain('Error validating');
  });
});

suite('journey validate, with the selector on the command line', () => {
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

  function validateWith(selector) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
      },
      args: [
        'journey',
        'validate',
        ...selector,
        `http://127.0.0.1:${fakeAm.port}/am`,
        '/',
        '--type',
        'classic',
      ],
      actions: [
        { type: 'sleep', ms: 4000 },
        { type: 'capture', label: 'after' },
      ],
    });
  }

  // record 0047: a complete command line never opens a prompt
  test('-a opens neither the menu nor a picker', () => {
    const { plain } = validateWith(['-a']).captures.after;
    expect(plain).not.toContain('Choose which journeys to validate');
    expect(plain).not.toContain('Select journey to act on');
    expect(plain).toContain('Error validating');
  });

  test('-i opens neither the menu nor a picker, and validates that journey', () => {
    const { plain } = validateWith(['-i', 'zion-login']).captures.after;
    expect(plain).not.toContain('Choose which journeys to validate');
    expect(plain).not.toContain('Select journey to act on');
    expect(plain).toContain("journey 'zion-login'");
  });

  test('-i and -a together, which the command accepts, still open nothing', () => {
    const { plain } = validateWith(['-i', 'zion-login', '-a']).captures.after;
    expect(plain).not.toContain('Select journey to act on');
  });
});

describe('journey validate, where nobody can be asked', () => {
  function validateWithoutPrompts(args) {
    ensureFrodoArtifact();
    const { binaryPath } = require('../e2e/utils/FrodoBinary.cjs');
    return cp.spawnSync(binaryPath, ['journey', 'validate', ...args], {
      env: { ...process.env, FRODO_TEST: '1', NO_COLOR: '1', NODE_OPTIONS: '' },
      input: '',
      encoding: 'utf8',
      timeout: 60000,
    });
  }

  test('fails with the standard message before any login', () => {
    const result = validateWithoutPrompts([
      'http://127.0.0.1:9/am',
      '/',
      'someone',
      'not-a-password',
    ]);
    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "one of '-i, --journey-id <journey> | -a, --all | -A, --all-separate' is required to choose which journeys to validate"
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      'Error getting tokens'
    );
  });
});
