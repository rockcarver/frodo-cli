import cp from 'child_process';
import fs from 'fs';
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

suite('frodo shell am functions', () => {
  let home;
  let fakeAm;

  beforeEach(() => {
    home = createShellTestHome();
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  test('am binds, queries users in the realm, and reads the session', async () => {
    ensureFrodoArtifact();
    fakeAm = await startFakeAm({
      recordPath: path.join(home, 'requests.jsonl'),
      journey: 'password',
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
    const host = `http://127.0.0.1:${fakeAm.port}/am`;
    const result = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { FRODO_USERNAME: 'someone', FRODO_PASSWORD: 'secret' },
      args: ['shell', host, '--type', 'classic'],
      actions: [
        { type: 'wait_prompt', timeoutMs: 30000 },
        { type: 'sleep', ms: 1500 },
        { type: 'clear_output' },
        { type: 'send_line', text: 'typeof am' },
        { type: 'wait_plain', regex: "'object'", timeoutMs: 20000 },
        { type: 'clear_output' },
        {
          type: 'send_line',
          text: 'const q = await am.users.query({_queryFilter: \'userName eq "jdoe"\'})',
        },
        { type: 'sleep', ms: 2500 },
        { type: 'clear_output' },
        { type: 'send_line', text: 'q.result[0].username' },
        { type: 'wait_plain', regex: "'jdoe'", timeoutMs: 20000 },
        { type: 'capture', label: 'query' },
        { type: 'clear_output' },
        { type: 'send_line', text: 'const s = await am.sessions.info()' },
        { type: 'sleep', ms: 2000 },
        { type: 'clear_output' },
        { type: 'send_line', text: 's.username' },
        { type: 'wait_plain', regex: 'someone@example.com', timeoutMs: 20000 },
        { type: 'capture', label: 'session' },
      ],
    });
    expect(result.captures.query.plain).toMatch(/'jdoe'/);
    expect(result.captures.session.plain).toMatch(/someone@example\.com/);
    // The request hit the realm-scoped AM users endpoint.
    const urls = fs
      .readFileSync(path.join(home, 'requests.jsonl'), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l).url);
    expect(
      urls.some(
        (u) =>
          u.includes('/json/realms/root/realms//users') ||
          u.includes('/json/realms/root/users') ||
          /\/json\/(realms\/root\/)?(realms\/[^/]+\/)?users/.test(u)
      )
    ).toBe(true);
  }, 60000);

  test('device-type strings complete from the fixed set', async () => {
    ensureFrodoArtifact();
    fakeAm = await startFakeAm({
      recordPath: path.join(home, 'requests.jsonl'),
      journey: 'password',
      users: [
        {
          _id: 'jdoe',
          userName: 'jdoe',
          givenName: 'John',
          sn: 'Doe',
          mail: 'j@x.z',
        },
      ],
    });
    const host = `http://127.0.0.1:${fakeAm.port}/am`;
    const result = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { FRODO_USERNAME: 'someone', FRODO_PASSWORD: 'secret' },
      args: ['shell', host, '--type', 'classic'],
      actions: [
        { type: 'wait_prompt', timeoutMs: 30000 },
        { type: 'sleep', ms: 1500 },
        { type: 'clear_output' },
        { type: 'send', text: "am.devices.list('jdoe', 'oa" },
        { type: 'key', name: 'tab' },
        { type: 'wait_plain', regex: '▸', timeoutMs: 20000 },
        { type: 'capture', label: 'devtype' },
      ],
    });
    // Tab completes 'oa' to 'oath' in place (single candidate) and the
    // hint line for the chosen type renders.
    expect(result.captures.devtype.plain).toMatch(/'oath/);
    expect(result.captures.devtype.plain).toMatch(/OATH devices/);
  }, 60000);
});
