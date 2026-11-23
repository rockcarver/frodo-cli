import cp from 'child_process';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

/**
 * The `$` of the built console (the bundle, or the native binary with
 * `npm run test:binary`) against the fake tenant, after a real classic login.
 * The library's request instances are inlined into the bundle like any other
 * module, and a bundling change can drop one without a source test noticing.
 * The fake tenant does not write down headers, so what is pinned here is that
 * the calls work end to end, that an error does not print the session value
 * it was sent with, and that `--curlirize` shows the call with the credential
 * hidden. Which header a call carries is the job of ShellRestLoopback.test.js.
 */
const SESSION = 'made-up-rest-session-value';
const USERS_URL = '/am/json/realms/root/realms/alpha/users?_queryFilter=true';
const API_VERSION = { 'Accept-API-Version': 'protocol=2.0,resource=4.0' };

suite('frodo shell $ (the console REST calls)', () => {
  let home;
  let fakeAm;

  beforeEach(async () => {
    home = createShellTestHome();
    ensureFrodoArtifact();
    fakeAm = await startFakeAm({
      recordPath: path.join(home, 'requests.jsonl'),
      journey: 'password',
      sessionToken: SESSION,
      users: [
        {
          _id: 'jdoe',
          userName: 'jdoe',
          givenName: 'John',
          sn: 'Doe',
          mail: 'j@x.z',
        },
      ],
      managedTypes: ['alpha_user'],
    });
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  const login = (extraArgs = []) => ({
    homeDir: home,
    allowPrompting: true,
    env: { FRODO_USERNAME: 'someone', FRODO_PASSWORD: 'secret' },
    args: [
      'shell',
      `http://127.0.0.1:${fakeAm.port}/am`,
      '--type',
      'classic',
      ...extraArgs,
    ],
  });

  test('P1 a call returns the answer, and the error of a refused call prints no credential', async () => {
    const result = runShellScenario({
      ...login(),
      actions: [
        { type: 'wait_prompt', timeoutMs: 30000 },
        { type: 'sleep', ms: 1500 },
        { type: 'clear_output' },
        {
          type: 'send_line',
          text: `const q = await $.get('${USERS_URL}', ${JSON.stringify(API_VERSION)})`,
        },
        { type: 'sleep', ms: 2500 },
        { type: 'clear_output' },
        { type: 'send_line', text: 'q.result[0].username' },
        { type: 'wait_plain', regex: "'jdoe'", timeoutMs: 20000 },
        { type: 'clear_output' },
        { type: 'send_line', text: '$.last.status' },
        { type: 'wait_plain', regex: '\\b200\\b', timeoutMs: 20000 },
        { type: 'clear_output' },
        { type: 'send_line', text: "await $.get('/am/nope')" },
        { type: 'wait_plain', regex: 'HTTP 404', timeoutMs: 20000 },
        { type: 'sleep', ms: 1500 },
        { type: 'capture', label: 'refused' },
        { type: 'clear_output' },
        {
          type: 'send_line',
          text: "await $.get('/am/nope').catch((e) => e)",
        },
        { type: 'sleep', ms: 2500 },
        { type: 'capture', label: 'returned' },
        { type: 'clear_output' },
        {
          type: 'send_line',
          text: "await $.get('/am/nope').catch((e) => console.log(e))",
        },
        { type: 'sleep', ms: 2500 },
        { type: 'capture', label: 'logged' },
      ],
    });
    expect(result.captures.refused.plain).toMatch(/HTTP 404/);
    for (const label of ['refused', 'returned', 'logged']) {
      expect(result.captures[label].plain).not.toContain(SESSION);
    }
  }, 90000);

  test('P2 --curlirize shows the call as a curl command with the credential hidden', async () => {
    const result = runShellScenario({
      ...login(['--curlirize']),
      actions: [
        { type: 'wait_prompt', timeoutMs: 30000 },
        { type: 'sleep', ms: 1500 },
        { type: 'clear_output' },
        {
          type: 'send_line',
          text: `await $.get('${USERS_URL}', ${JSON.stringify(API_VERSION)}).then(() => 'done')`,
        },
        { type: 'wait_plain', regex: "'done'", timeoutMs: 20000 },
        { type: 'capture', label: 'curl' },
        { type: 'clear_output' },
        { type: 'send_line', text: '1 + 1' },
        { type: 'wait_plain', regex: '\\b2\\b', timeoutMs: 20000 },
      ],
    });
    const plain = result.captures.curl.plain;
    expect(plain).toMatch(/curl /);
    expect(plain).toContain('/am/json/realms/root/realms/alpha/users');
    expect(plain).toContain('<redacted>');
    expect(plain).not.toContain(SESSION);
  }, 90000);
});
