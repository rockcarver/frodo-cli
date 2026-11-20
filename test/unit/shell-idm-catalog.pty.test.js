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

suite('frodo shell openidm resource completion', () => {
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

  test('after sign-in, quoted strings complete from the live managed types', async () => {
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
      managedTypes: ['alpha_user', 'alpha_role', 'alpha_org'],
    });
    const host = `http://127.0.0.1:${fakeAm.port}/am`;
    const result = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { FRODO_USERNAME: 'someone', FRODO_PASSWORD: 'secret' },
      args: ['shell', host, '--type', 'classic'],
      actions: [
        { type: 'wait_prompt', timeoutMs: 30000 },
        // The catalog refresh runs right after sign-in; give it a beat.
        { type: 'sleep', ms: 1500 },
        { type: 'clear_output' },
        { type: 'send', text: "openidm.read('alpha_" },
        { type: 'key', name: 'tab' },
        { type: 'wait_plain', regex: '▸', timeoutMs: 15000 },
        { type: 'capture', label: 'types' },
      ],
    });
    const plain = result.captures.types.plain;
    // The line completed past the family (the suffix fallback) and the
    // hint lists the LIVE types of this tenant, not a static list.
    expect(plain).toMatch(/managed\/alpha_/);
    expect(plain).toMatch(/managed\/alpha_user/);
    expect(plain).toMatch(/managed\/alpha_org/);
    expect(plain).toMatch(/managed\/alpha_role/);
  }, 60000);

  test('the static families still complete without enrichment (offline)', async () => {
    ensureFrodoArtifact();
    const result = runShellScenario({
      homeDir: home,
      actions: [
        { type: 'wait_prompt' },
        { type: 'clear_output' },
        { type: 'send', text: "openidm.read('repo/li" },
        { type: 'key', name: 'tab' },
        { type: 'wait_plain', regex: '▸', timeoutMs: 15000 },
        { type: 'capture', label: 'repo' },
      ],
    });
    // repo/link is fixed, so it completes even though nothing is live.
    expect(result.captures.repo.plain).toMatch(/repo\/link/);
  }, 60000);

  test('$ facade URL strings complete from the same live catalog', async () => {
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
      managedTypes: ['alpha_user', 'alpha_role', 'alpha_org'],
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
        { type: 'send', text: "$.get('/openidm/alpha_" },
        { type: 'key', name: 'tab' },
        { type: 'wait_plain', regex: '▸', timeoutMs: 15000 },
        { type: 'capture', label: 'facade' },
      ],
    });
    const plain = result.captures.facade.plain;
    // The typed /openidm/ prefix rides along; the suggestion is the full
    // replacement text for the string content.
    expect(plain).toMatch(/\/openidm\/managed\/alpha_user/);
  }, 60000);
});
