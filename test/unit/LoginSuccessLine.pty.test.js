import cp from 'child_process';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `frodo login` confirms with a line in the info color, like the other
 * messages that report what frodo did. It used to print the line with the
 * default message type, which is uncolored, so it was the one plain white
 * line among the cyan ones.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

suite('frodo login success line, on a real terminal', () => {
  let home;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
  });

  afterEach(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  test('is printed in the info color', async () => {
    fakeAm = await startFakeAm({
      recordPath: path.join(home, 'requests.jsonl'),
      journey: 'password',
    });
    const result = runShellScenario({
      homeDir: home,
      allowPrompting: true,
      // Jest sets NO_COLOR, which would turn every color off.
      env: { NO_COLOR: '__FRODO_PTY_DELETE__' },
      args: [
        'login',
        `http://127.0.0.1:${fakeAm.port}/am`,
        '--type',
        'classic',
        'someone',
        'secret',
      ],
      actions: [
        { type: 'wait_plain', regex: 'Logged in to', timeoutMs: 30000 },
        { type: 'sleep', ms: 300 },
      ],
    });
    expect(result.plainOutput).toContain(
      `Logged in to http://127.0.0.1:${fakeAm.port}/am`
    );
    // A color code right before the text: the line is not plain.
    expect(result.rawOutput).toMatch(/\x1b\[[0-9;]+mLogged in to /);
  }, 60000);
});
