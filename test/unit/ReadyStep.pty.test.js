import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { binaryPath, ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { replayScreen } from '../utils/ScreenReplay.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The Ready step and the Enter label on a real terminal (decision record
 * 0043). An interactive session that asked for anything ends in "Ready to
 * run?" (Run, Edit options, Cancel); until then Enter says `next`, and only
 * Run says `run`. A command line that is complete never sees the step.
 *
 * Most scenarios run `conn save --no-validate --no-sa --no-log-api`, which is
 * offline: the Connection page opens for the missing password, and the proof
 * that the command ran is the profile file it writes. The labels on a picker
 * of the resolution pass and on a picker that opens after login come from
 * `journey validate` on a fake AM.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const host = 'https://ready-probe.example.com/am';
const emptyCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};
const offline = ['--alias', 'x', '--no-validate', '--no-sa', '--no-log-api'];
const SAVED = 'Saved connection profile';

/** The screen a capture leaves behind: erased frames are gone, the lines that stay are what a user keeps. */
const screenOf = (capture) => replayScreen(capture.raw).join('\n');
const ITALIC = '\x1b[3m';
/** The SGR codes drawn right before the last footer line that starts with `command` in `raw`. */
function footerStyle(raw, command) {
  const index = raw.lastIndexOf(command);
  return raw.slice(Math.max(0, index - 9), index);
}
const lastFrame = (plain) => plain.split('┌ Navigate').pop();
const navigate = (frame) => frame.split('└')[0];
const footer = (frame) => frame.split('└').pop();

suite('the Ready step, on a real terminal', () => {
  let home;
  let profilesPath;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
    profilesPath = path.join(home, 'Connections.json');
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  function run(args, actions) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...emptyCredentials,
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
      },
      args,
      actions,
    });
  }

  /** `conn save` with the host and user typed and the password left to the Connection page. */
  const connSave = ['conn', 'save', host, 'someone', ...offline];

  /** The hosts of the profiles saved so far: the file exists after any start, with or without the host. */
  const savedHosts = () =>
    fs.existsSync(profilesPath)
      ? Object.keys(JSON.parse(fs.readFileSync(profilesPath, 'utf8')))
      : [];

  /** The password row of the Connection page, filled, and Done chosen: the last prompt before Ready. */
  const throughConnectionPage = [
    { type: 'wait_plain', regex: 'Connection:', timeoutMs: 30000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label: 'page' },
    { type: 'key', name: 'enter' },
    { type: 'send', text: 'secretpw' },
    { type: 'key', name: 'enter' },
    { type: 'wait_plain', regex: 'password: ••••••••', timeoutMs: 8000 },
    { type: 'sleep', ms: 400 },
    { type: 'key', name: 'down' },
    { type: 'key', name: 'enter' },
  ];

  /** Waits for the Ready step and captures it. */
  const atReady = [
    { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 15000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label: 'ready' },
  ];

  test('opens after the Connection page, shows the command and the three rows, and nothing has run yet', () => {
    const result = run(connSave, [...throughConnectionPage, ...atReady]);

    const ready = lastFrame(result.captures.ready.plain);
    expect(ready).toContain('Ready to run?');
    expect(ready).toMatch(/› Run/);
    expect(ready).toContain('Edit options');
    expect(ready).toContain('Cancel');
    // the command as it will run, the password masked
    expect(footer(ready)).toContain(`frodo conn save ${host} someone`);
    expect(footer(ready)).not.toContain('secretpw');
    // the Connection page before it did not claim to run anything
    const page = lastFrame(result.captures.page.plain);
    expect(navigate(page)).toContain('[ENTER] edit / done');
    expect(page).toContain('Done — continue with these values');
    expect(page).not.toMatch(/Done — run/);
    // the command is complete, so the footer is green, not red and italic
    expect(
      footerStyle(result.captures.ready.raw, 'frodo conn save')
    ).not.toContain(ITALIC);
    // the step is a question: nothing was saved while it was open
    expect(result.captures.ready.plain).not.toContain(SAVED);
    expect(savedHosts()).toEqual([]);
  });

  test('Enter says run on the Run row, edit options on the next, cancel on the last', () => {
    const labelAt = (downs) =>
      run(connSave, [
        ...throughConnectionPage,
        ...atReady,
        ...Array.from({ length: downs }, () => ({ type: 'key', name: 'down' })),
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'moved' },
      ]).captures.moved.plain;
    expect(navigate(lastFrame(labelAt(0)))).toContain('[ENTER] run');
    expect(navigate(lastFrame(labelAt(1)))).toContain('[ENTER] edit options');
    expect(navigate(lastFrame(labelAt(2)))).toContain('[ENTER] cancel');
  });

  test('Escape is labelled as the way out of the step', () => {
    const result = run(connSave, [...throughConnectionPage, ...atReady]);
    const menu = navigate(lastFrame(result.captures.ready.plain));
    expect(menu).toContain('[ESC] cancel');
    expect(menu).not.toContain('back');
  });

  test('Run runs the command', () => {
    const result = run(connSave, [
      ...throughConnectionPage,
      ...atReady,
      { type: 'key', name: 'enter' },
      { type: 'wait_plain', regex: SAVED, timeoutMs: 30000 },
      // the command is printed right after its result
      { type: 'sleep', ms: 700 },
      { type: 'capture', label: 'end' },
    ]);
    expect(result.plainOutput).toContain(SAVED);
    expect(savedHosts()).toEqual([host]);
    // the step's frame is erased, and the command is printed once
    const screen = replayScreen(result.captures.end.raw);
    expect(screen.join('\n')).not.toContain('Ready to run');
    expect(
      screen.filter((line) => line.startsWith('frodo conn save'))
    ).toHaveLength(1);
  });

  test('Cancel runs nothing, prints nothing and exits 0', () => {
    const result = run(connSave, [
      ...throughConnectionPage,
      ...atReady,
      { type: 'key', name: 'down' },
      { type: 'key', name: 'down' },
      { type: 'key', name: 'enter' },
      // the command ends by itself, and quietly
      { type: 'wait_exit', timeoutMs: 15000 },
      { type: 'sleep', ms: 300 },
      { type: 'capture', label: 'after' },
    ]);
    // nothing is left on the screen: no frame, no printed command, no result
    expect(screenOf(result.captures.after)).toBe('');
    expect(savedHosts()).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test('Escape cancels the same way', () => {
    const result = run(connSave, [
      ...throughConnectionPage,
      ...atReady,
      { type: 'key', name: 'escape' },
      // the first Escape waits for a second one before it acts
      { type: 'wait_exit', timeoutMs: 15000 },
      { type: 'sleep', ms: 300 },
      { type: 'capture', label: 'after' },
    ]);
    expect(screenOf(result.captures.after)).toBe('');
    expect(savedHosts()).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test('a second Escape cancels at once', () => {
    const result = run(connSave, [
      ...throughConnectionPage,
      ...atReady,
      { type: 'key', name: 'escape' },
      { type: 'key', name: 'escape' },
      { type: 'wait_exit', timeoutMs: 15000 },
      { type: 'sleep', ms: 300 },
      { type: 'capture', label: 'after' },
    ]);
    expect(screenOf(result.captures.after)).toBe('');
    expect(savedHosts()).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test('Edit options opens the editor and comes back to the step, which then runs', () => {
    const result = run(connSave, [
      ...throughConnectionPage,
      ...atReady,
      { type: 'key', name: 'down' },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
      {
        type: 'wait_plain',
        regex: "Optional options for 'save'",
        timeoutMs: 15000,
      },
      { type: 'sleep', ms: 400 },
      { type: 'capture', label: 'editor' },
      // leaving the editor returns to the step
      { type: 'clear_output' },
      { type: 'key', name: 'escape' },
      { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 15000 },
      { type: 'sleep', ms: 500 },
      { type: 'capture', label: 'again' },
      { type: 'key', name: 'up' },
      { type: 'key', name: 'enter' },
      { type: 'wait_plain', regex: SAVED, timeoutMs: 30000 },
    ]);
    expect(result.captures.editor.plain).toContain(
      "Optional options for 'save'"
    );
    expect(lastFrame(result.captures.again.plain)).toContain('Ready to run?');
    expect(result.plainOutput).toContain(SAVED);
  });

  test('an option set in the editor is in the command the step shows and runs', () => {
    const result = run(connSave, [
      ...throughConnectionPage,
      ...atReady,
      { type: 'key', name: 'down' },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
      {
        type: 'wait_plain',
        regex: "Optional options for 'save'",
        timeoutMs: 15000,
      },
      { type: 'sleep', ms: 400 },
      // --no-validate etc. are given already; pick a global flag
      { type: 'send', text: 'verbose' },
      { type: 'sleep', ms: 400 },
      { type: 'key', name: 'space' },
      { type: 'sleep', ms: 300 },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
      { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 15000 },
      { type: 'sleep', ms: 500 },
      { type: 'capture', label: 'again' },
    ]);
    expect(footer(lastFrame(result.captures.again.plain))).toContain(
      '--verbose'
    );
  });

  describe('is not asked', () => {
    test('for a complete command line', () => {
      const result = run(
        ['conn', 'save', host, 'someone', 'secretpw', ...offline],
        [{ type: 'wait_plain', regex: SAVED, timeoutMs: 30000 }]
      );
      expect(result.plainOutput).toContain(SAVED);
      expect(result.plainOutput).not.toContain('Ready to run?');
      expect(result.plainOutput).not.toContain('Navigate');
    });

    test('with --no-prompt', () => {
      const result = run(
        [...connSave, '--no-prompt'],
        [{ type: 'sleep', ms: 4000 }]
      );
      expect(result.plainOutput).not.toContain('Ready to run?');
      expect(result.plainOutput).not.toContain('Connection:');
      expect(result.plainOutput).not.toContain('Navigate');
    });

    test('with FRODO_NO_PROMPT', () => {
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: {
          ...emptyCredentials,
          FRODO_NO_PROMPT: '1',
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
        },
        args: connSave,
        actions: [{ type: 'sleep', ms: 4000 }],
      });
      expect(result.plainOutput).not.toContain('Ready to run?');
      expect(result.plainOutput).not.toContain('Navigate');
    });

    test('without a terminal', () => {
      const piped = cp.spawnSync(binaryPath, connSave, {
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          ...emptyCredentials,
          NO_COLOR: '1',
          FRODO_TEST: '',
          HOME: home,
          USERPROFILE: home,
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
        },
      });
      const output = `${piped.stdout}${piped.stderr}`;
      expect(output).not.toContain('Ready to run?');
      expect(output).not.toContain('Navigate');
    });
  });
});

suite('the Enter label and the Ready step with a fake tenant', () => {
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

  const tenant = () => `http://127.0.0.1:${fakeAm.port}/am`;
  const withCredentials = {
    ...emptyCredentials,
    FRODO_USERNAME: 'someone',
    FRODO_PASSWORD: 'not-a-password',
  };

  function onTenant(args, actions, env = {}) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...withCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
        ...env,
      },
      args,
      actions,
    });
  }

  test('a picker of the resolution pass says next, the step says run, the picker after login says select', () => {
    const run = onTenant(
      ['journey', 'validate', tenant(), '/', '--type', 'classic'],
      [
        {
          type: 'wait_plain',
          regex: 'Choose which journeys to validate',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'oneOf' },
        { type: 'clear_output' },
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 15000 },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'ready' },
        { type: 'clear_output' },
        { type: 'key', name: 'enter' },
        {
          type: 'wait_plain',
          regex: 'Select journey to act on',
          timeoutMs: 30000,
        },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'afterLogin' },
        { type: 'clear_output' },
        { type: 'key', name: 'enter' },
        { type: 'sleep', ms: 3000 },
        { type: 'capture', label: 'ran' },
      ]
    );
    const oneOf = navigate(lastFrame(run.captures.oneOf.plain));
    expect(oneOf).toContain('[ENTER] next');
    expect(oneOf).not.toContain('[ENTER] select');

    const ready = lastFrame(run.captures.ready.plain);
    expect(navigate(ready)).toContain('[ENTER] run');
    // the journey is chosen after login: the step says so, and the footer is not green yet
    expect(ready).toContain('after login');
    expect(footer(ready)).toContain(`frodo journey validate ${tenant()}`);
    expect(footer(ready)).not.toContain('--journey-id');
    expect(
      footerStyle(run.captures.ready.raw, 'frodo journey validate')
    ).toContain(ITALIC);

    const afterLogin = navigate(lastFrame(run.captures.afterLogin.plain));
    expect(afterLogin).toContain('[ENTER] select');

    expect(run.captures.ran.plain).toContain("journey 'matrix-login'");
  });

  test('a sub-command picked in a container does not count: the command runs without the step', () => {
    const run = onTenant(
      ['journey'],
      [
        { type: 'wait_plain', regex: 'Navigate', timeoutMs: 30000 },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'container' },
        { type: 'send', text: 'list' },
        { type: 'sleep', ms: 400 },
        { type: 'clear_output' },
        { type: 'key', name: 'enter' },
        { type: 'wait_plain', regex: 'zion-login', timeoutMs: 30000 },
        { type: 'sleep', ms: 1500 },
        { type: 'capture', label: 'ran' },
      ],
      {
        FRODO_HOST: tenant(),
        FRODO_DEPLOYMENT: 'classic',
      }
    );
    // the container's picker promises nothing about running
    expect(navigate(lastFrame(run.captures.container.plain))).toContain(
      '[ENTER] select'
    );
    expect(run.captures.ran.plain).toContain('matrix-login');
    expect(run.captures.ran.plain).not.toContain('Ready to run?');
  });
});
