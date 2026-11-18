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

suite('frodo shell openidm params-object completion', () => {
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

  test('Tab inside the params object lists CREST keys; typed keys narrow', async () => {
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
        // The reported case: past the resource string, in the params
        // object. Double-Tab lists the CREST key set.
        { type: 'send', text: "openidm.query('managed/alpha_user', {" },
        { type: 'key', name: 'tab' },
        { type: 'sleep', ms: 150 },
        { type: 'key', name: 'tab' },
        { type: 'wait_plain', regex: '_queryFilter', timeoutMs: 20000 },
        { type: 'capture', label: 'keys' },
        { type: 'clear_output' },
        // Narrowing: with _queryFilter used, _pageSize still completes.
        { type: 'send', text: "queryFilter: 'true', _pa" },
        { type: 'key', name: 'tab' },
        { type: 'sleep', ms: 150 },
        { type: 'key', name: 'tab' },
        { type: 'wait_plain', regex: '_pageSize', timeoutMs: 20000 },
        { type: 'capture', label: 'narrow' },
      ],
    });
    const keys = result.captures.keys.plain;
    expect(keys).toMatch(/_queryFilter/);
    expect(keys).toMatch(/_pageSize/);
    expect(keys).toMatch(/params keys/);
    // The narrowing inserted the rest of the key in place.
    const narrow = result.captures.narrow.plain;
    expect(narrow).toMatch(/_pageSize/);
    expect(narrow).toMatch(/_queryFilter: 'true'/);
  }, 60000);

  test('the hint line names the argument position past a comma', async () => {
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
        { type: 'send', text: "openidm.update('managed/alpha_user/x', null, " },
        { type: 'key', name: 'tab' },
        { type: 'sleep', ms: 600 },
        { type: 'capture', label: 'hint' },
      ],
    });
    expect(result.captures.hint.plain).toMatch(
      /arg 3 of 5 · value: object — the replacement object/
    );
  }, 60000);
});
