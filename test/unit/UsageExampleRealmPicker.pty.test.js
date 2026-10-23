import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from '@jest/globals';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * Why a usage example has to name the realm (UsageExampleOperands.test.js):
 * run in a terminal, `frodo journey list <host>` asks "Choose a realm" as soon
 * as the tenant has more than one realm, and `frodo journey list <host>
 * /alpha` does not. This drives the REAL CLI of this checkout through a
 * pseudo-terminal against the fake AM (test/utils/FakeAm.mjs, a separate
 * process) with two realms, so the claim in docs/INTERACTIVE-COMMANDS.md
 * ("Post-auth pickers") is checked, not just quoted.
 *
 * The credentials come from the environment because the realm is the operand
 * between the host and the user name: this is the only way to give a login
 * and still leave the realm out. Needs python3 with `pty` (Linux, macOS);
 * skipped on Windows.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const TIMEOUT = 120000;

suite('the realm picker, on a real terminal', () => {
  let home;
  let recordPath;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = createShellTestHome();
    recordPath = path.join(
      os.tmpdir(),
      `frodo-fake-am-${process.pid}-${Date.now()}.jsonl`
    );
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      realms: ['alpha', 'bravo'],
    });
  });

  afterEach(() => {
    fakeAm.stop();
    removeShellTestHome(home);
    fs.rmSync(recordPath, { force: true });
  });

  function journeyList(operands, actions) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        FRODO_USERNAME: 'someone@example.com',
        FRODO_PASSWORD: 'secret',
      },
      args: ['journey', 'list', ...operands],
      actions,
    });
  }

  function requestedUrls() {
    return fs
      .readFileSync(recordPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).url);
  }

  test(
    'a host without a realm opens the realm picker',
    () => {
      const result = journeyList(
        [`http://127.0.0.1:${fakeAm.port}/am`],
        [
          {
            type: 'wait_plain',
            regex: 'Choose a realm',
            timeoutMs: 60000,
          },
          { type: 'sleep', ms: 300 },
          // Escape keeps the default realm; the command then carries on.
          { type: 'key', name: 'escape' },
          { type: 'sleep', ms: 1500 },
        ]
      );
      expect(result.plainOutput).toContain('Choose a realm (default: /)');
      expect(result.plainOutput).toContain('bravo');
    },
    TIMEOUT
  );

  test(
    'naming the realm after the host opens no picker, and the command goes on',
    () => {
      const result = journeyList(
        [`http://127.0.0.1:${fakeAm.port}/am`, '/alpha'],
        // Nothing to wait for on screen: the fake AM has no journeys, so the
        // CLI reports an error. Give it time to get past login and the point
        // where the picker would have opened.
        [{ type: 'sleep', ms: 6000 }]
      );
      expect(result.plainOutput).not.toContain('Choose a realm');
      // The command ran past login: it asked the tenant for its journeys.
      expect(requestedUrls().some((url) => url.includes('/trees'))).toBe(true);
    },
    TIMEOUT
  );

  test(
    'an example as printed (host, realm, user, password) opens no picker either',
    () => {
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        args: [
          'journey',
          'list',
          `http://127.0.0.1:${fakeAm.port}/am`,
          '/alpha',
          'someone@example.com',
          'secret',
        ],
        actions: [{ type: 'sleep', ms: 6000 }],
      });
      expect(result.plainOutput).not.toContain('Choose a realm');
      expect(requestedUrls().some((url) => url.includes('/trees'))).toBe(true);
    },
    TIMEOUT
  );
});
