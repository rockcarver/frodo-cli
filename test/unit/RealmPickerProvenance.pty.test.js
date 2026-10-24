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
 * An omitted realm keeps the deployment's default instead of opening an
 * interactive picker, even when the target has multiple realms. This drives
 * the REAL CLI through a pseudo-terminal against the fake AM with two realms.
 *
 * The credentials come from the environment in the first two cases because the
 * realm is the operand between the host and the user name: this is the only
 * way to give a login and still leave the realm out. Needs python3 with `pty`
 * (Linux, macOS); skipped on Windows.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const TIMEOUT = 120000;

suite('default realm behavior, on a real terminal', () => {
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
    'a host without a realm keeps the deployment default without prompting',
    () => {
      const result = journeyList(
        [`http://127.0.0.1:${fakeAm.port}/am`],
        [{ type: 'sleep', ms: 6000 }]
      );
      expect(result.plainOutput).not.toContain('Choose a realm');
      expect(
        requestedUrls().some(
          (url) => url.includes('/realms/root/') && url.includes('/trees')
        )
      ).toBe(true);
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
        // where a realm picker would have opened.
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
