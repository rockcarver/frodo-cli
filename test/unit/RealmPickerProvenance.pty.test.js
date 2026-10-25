import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
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
 * The realm picker only opens if another required input prompted the user.
 * This drives the REAL CLI through a pseudo-terminal against the fake AM
 * with two realms.
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

  function journeyList(operands, actions, env = {}) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        FRODO_USERNAME: 'someone@example.com',
        FRODO_PASSWORD: 'secret',
        ...env,
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
    'an explicit service account opens no Connection page or credential prompt',
    () => {
      const keyFile = path.join(home, 'throwaway.jwk');
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      fs.writeFileSync(
        keyFile,
        JSON.stringify(privateKey.export({ format: 'jwk' })),
        {
          mode: 0o600,
        }
      );
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        args: [
          'conn',
          'save',
          `http://127.0.0.1:${fakeAm.port}/am`,
          '--sa-id',
          'test-account',
          '--sa-jwk-file',
          keyFile,
          '--type',
          'cloud',
        ],
        actions: [
          {
            type: 'wait_plain',
            regex: 'Error getting tokens',
            timeoutMs: 10000,
          },
        ],
      });
      expect(result.plainOutput).not.toContain('Connection:');
      expect(result.plainOutput).not.toMatch(/username: \(not set\)|Username:/);
      expect(result.plainOutput).not.toMatch(/password: \(not set\)|Password:/);
      expect(result.plainOutput).not.toContain('Choose a realm');
      // The CLI reached authentication, rather than waiting for credentials.
      expect(requestedUrls().some((url) => url.includes('/access_token'))).toBe(
        true
      );
    },
    TIMEOUT
  );

  test(
    'a given host but missing credentials opens the Connection page, then the realm picker',
    () => {
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        args: ['journey', 'list', `http://127.0.0.1:${fakeAm.port}/am`],
        actions: [
          { type: 'wait_plain', regex: 'Connection:', timeoutMs: 60000 },
          // The page opens on the first row without a value: username.
          { type: 'key', name: 'enter' },
          { type: 'send', text: 'someone@example.com' },
          { type: 'key', name: 'enter' },
          { type: 'key', name: 'down' },
          { type: 'key', name: 'enter' },
          { type: 'send', text: 'secret' },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: 'password: ••••••••', timeoutMs: 10000 },
          { type: 'key', name: 'down' },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 60000 },
          { type: 'sleep', ms: 300 },
          { type: 'key', name: 'escape' },
          { type: 'sleep', ms: 6000 },
        ],
      });
      expect(result.plainOutput).toContain('Connection:');
      expect(result.plainOutput).toContain('username: (not set)');
      expect(result.plainOutput).toContain('Choose a realm (default: /)');
      expect(requestedUrls().some((url) => url.includes('/trees'))).toBe(true);
    },
    TIMEOUT
  );

  test(
    'a missing host prompts for completion, then the realm picker opens and Escape keeps the default',
    () => {
      const result = journeyList(
        [],
        [
          { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 60000 },
          { type: 'send', text: `http://127.0.0.1:${fakeAm.port}/am` },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 60000 },
          { type: 'sleep', ms: 300 },
          { type: 'key', name: 'escape' },
          { type: 'sleep', ms: 6000 },
        ]
      );
      expect(result.plainOutput).toContain('Choose a realm (default: /)');
      expect(result.plainOutput).toContain('alpha');
      expect(result.plainOutput).toContain('bravo');
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
    'FRODO_REALM opens no picker, and the command uses that realm',
    () => {
      const result = journeyList(
        [`http://127.0.0.1:${fakeAm.port}/am`],
        [{ type: 'sleep', ms: 6000 }],
        { FRODO_REALM: 'alpha' }
      );
      expect(result.plainOutput).not.toContain('Choose a realm');
      expect(
        requestedUrls().some(
          (url) => url.includes('/realms/alpha/') && url.includes('/trees')
        )
      ).toBe(true);
    },
    TIMEOUT
  );

  test(
    'everything given except the realm: no picker, the default realm is used',
    () => {
      const result = journeyList(
        [`http://127.0.0.1:${fakeAm.port}/am`],
        [{ type: 'sleep', ms: 6000 }]
      );
      expect(result.plainOutput).not.toContain('Choose a realm');
      const urls = requestedUrls();
      expect(
        urls.some(
          (url) => url.includes('/realms/root/') && url.includes('/trees')
        )
      ).toBe(true);
      expect(urls.some((url) => url.includes('/realms/root/realms/'))).toBe(
        false
      );
    },
    TIMEOUT
  );

  test(
    'a realm from FRODO_REALM but a missing host: the picker stays closed',
    () => {
      const result = journeyList(
        [],
        [
          { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 60000 },
          { type: 'send', text: `http://127.0.0.1:${fakeAm.port}/am` },
          { type: 'key', name: 'enter' },
          { type: 'sleep', ms: 6000 },
        ],
        { FRODO_REALM: 'bravo' }
      );
      expect(result.plainOutput).not.toContain('Choose a realm');
      expect(
        requestedUrls().some(
          (url) => url.includes('/realms/bravo/') && url.includes('/trees')
        )
      ).toBe(true);
    },
    TIMEOUT
  );

  test(
    'a prompted mandatory command option does not open the realm picker',
    () => {
      const result = runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: {
          FRODO_HOST: `http://127.0.0.1:${fakeAm.port}/am`,
          FRODO_USERNAME: 'someone@example.com',
          FRODO_PASSWORD: 'secret',
        },
        args: ['realm', 'add-custom-domain'],
        actions: [
          {
            type: 'wait_plain',
            regex: 'Enter a value for -d, --domain <name>:',
            timeoutMs: 60000,
          },
          { type: 'send', text: 'example.com' },
          { type: 'key', name: 'enter' },
          { type: 'sleep', ms: 6000 },
        ],
      });
      expect(result.plainOutput).not.toContain('Choose a realm');
      expect(requestedUrls().some((url) => url.includes('/realms/root'))).toBe(
        true
      );
    },
    TIMEOUT
  );

  test(
    'a single saved profile is selected without a prompt, so no realm picker opens',
    () => {
      const profilesPath = path.join(home, 'Connections.json');
      fs.writeFileSync(
        profilesPath,
        JSON.stringify({
          [`http://127.0.0.1:${fakeAm.port}/am`]: {},
        })
      );
      const result = journeyList([], [{ type: 'sleep', ms: 6000 }], {
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
      });
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
