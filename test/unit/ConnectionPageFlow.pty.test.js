import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';

/**
 * The Connection page on a real terminal, with a host and a username on the
 * command line and no password (frodo-cli#920 live test):
 *
 * - it opens on the row that still needs a value (the password), not on the
 *   host;
 * - its footer is the command as it would run: red and italic while the
 *   password is missing, green with the password masked once it is
 *   committed;
 * - Escape cancels the command: no second, unframed `Password:` prompt asks
 *   again and nothing is saved.
 *
 * `--no-validate --no-sa --no-log-api` keep `conn save` offline.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const host = 'https://page-probe.example.com/am';
const emptyCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
};
const ITALIC = '\x1b[3m';

/** The SGR codes drawn right before the last footer line in `raw`. */
function lastFooterStyle(raw) {
  const index = raw.lastIndexOf('frodo conn save');
  return raw.slice(Math.max(0, index - 9), index);
}

suite('connection page flow, on a real terminal', () => {
  let home;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  const connSave = [
    'conn',
    'save',
    host,
    'someone',
    '--alias',
    'x',
    '--no-validate',
    '--no-sa',
    '--no-log-api',
  ];

  function run(actions, { args = connSave, env = {} } = {}) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      // The colours are what the footer check reads: Jest sets NO_COLOR.
      env: { ...emptyCredentials, NO_COLOR: '__FRODO_PTY_DELETE__', ...env },
      args,
      actions,
    });
  }

  test('opens on the password row; the footer turns green once the password is committed', () => {
    const result = run([
      { type: 'wait_plain', regex: 'Connection:', timeoutMs: 30000 },
      { type: 'sleep', ms: 500 },
      { type: 'capture', label: 'page' },
      // Enter edits the focused row: the password, not the host.
      { type: 'key', name: 'enter' },
      { type: 'send', text: 'secretpw' },
      { type: 'key', name: 'enter' },
      { type: 'wait_plain', regex: 'password: ••••••••', timeoutMs: 8000 },
      { type: 'sleep', ms: 500 },
      { type: 'capture', label: 'filled' },
      { type: 'key', name: 'down' },
      { type: 'key', name: 'enter' },
      {
        type: 'wait_plain',
        regex: 'Saved connection profile',
        timeoutMs: 30000,
      },
    ]);

    const page = result.captures.page;
    expect(page.plain).toMatch(/› password: \(not set\)/);
    expect(page.plain).not.toMatch(/› host:/);
    // Incomplete: red and italic, and no password token yet.
    expect(lastFooterStyle(page.raw)).toContain(ITALIC);
    expect(page.plain).not.toContain('********');

    const filled = result.captures.filled;
    expect(filled.plain).toContain(`frodo conn save ${host} someone ********`);
    // Complete: green, not italic, the password masked.
    expect(lastFooterStyle(filled.raw)).not.toContain(ITALIC);
    expect(filled.plain).not.toContain('secretpw');

    const saved = JSON.parse(
      fs.readFileSync(path.join(home, '.frodo', 'Connections.json'), 'utf8')
    );
    expect(Object.keys(saved)).toEqual([host]);
  });

  test('Escape cancels the command and asks nothing a second time', () => {
    const result = run([
      { type: 'wait_plain', regex: 'Connection:', timeoutMs: 30000 },
      { type: 'sleep', ms: 500 },
      { type: 'key', name: 'escape' },
      { type: 'sleep', ms: 1500 },
    ]);
    expect(result.plainOutput).not.toMatch(/Password:|Username:/);
    expect(result.plainOutput).not.toContain('Saved connection profile');
    // The profiles file exists after any start; the host must not be in it.
    expect(
      fs.readFileSync(path.join(home, '.frodo', 'Connections.json'), 'utf8')
    ).not.toContain(host);
  });

  test('a username-only profile prefills the username and the page opens on the password', () => {
    const profilesPath = path.join(home, 'Connections.json');
    fs.writeFileSync(
      profilesPath,
      JSON.stringify({
        [host]: {
          tenant: host,
          alias: 'x',
          deploymentType: 'cloud',
          username: 'someone',
        },
      })
    );
    const result = run(
      [
        { type: 'wait_plain', regex: 'Connection:', timeoutMs: 30000 },
        { type: 'sleep', ms: 500 },
      ],
      {
        args: ['journey', 'list', host],
        env: { FRODO_CONNECTION_PROFILES_PATH: profilesPath },
      }
    );
    expect(result.plainOutput).toContain('username: someone (from profile x)');
    expect(result.plainOutput).toMatch(/› password: \(not set\)/);
  });
});
