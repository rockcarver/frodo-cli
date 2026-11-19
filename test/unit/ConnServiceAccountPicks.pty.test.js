import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import { answerReady } from '../utils/ReadyStep.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * Decision record 0038 for the local commands `conn service-account describe`
 * and `remove`: they read and write the connection profile of this machine and
 * never log in, so the pick of the service account (`--name`) is a pick that
 * needs no login (`needsLogin: false`, record 0044) and the resolution pass
 * opens it without one. The profile is saved under the address of a fake
 * tenant that records every request: a login, or any other call to the tenant,
 * would show in its log, and the log stays empty.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const launch = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist/launch.cjs'
);

const TIMEOUT = 120000;
const noCredentials = {
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

const lastFrame = (plain) => plain.split('┌ Navigate').pop();
const footer = (frame) => frame.split('└').pop();
const waitFor = (regex) => ({ type: 'wait_plain', regex, timeoutMs: 30000 });
const settle = { type: 'sleep', ms: 500 };

suite('conn service-account describe and remove, on a real terminal', () => {
  let home;
  let recordPath;
  let profilesPath;
  let fakeAm;
  let tenant;
  let jwkFile;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(async () => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
    profilesPath = path.join(home, 'Connections.json');
    fakeAm = await startFakeAm({ recordPath, journey: 'password' });
    tenant = `http://127.0.0.1:${fakeAm.port}/am`;
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    jwkFile = path.join(home, 'sa.jwk.json');
    fs.writeFileSync(
      jwkFile,
      JSON.stringify(privateKey.export({ format: 'jwk' }))
    );
    // a profile for the tenant, with the alias matrix, and no service account yet
    fs.writeFileSync(
      profilesPath,
      JSON.stringify({
        [tenant]: { tenant, alias: 'matrix', deploymentType: 'classic' },
      })
    );
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  /** Runs the built CLI without a terminal; the home is the test's. */
  function cli(args) {
    return cp.spawnSync(process.execPath, [launch, ...args], {
      cwd: home,
      input: '',
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home,
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
        FRODO_NO_CACHE: 'true',
        FRODO_NO_PROMPT: '1',
        NO_COLOR: '1',
        FRODO_HOST: '',
        FRODO_USERNAME: '',
        FRODO_PASSWORD: '',
        FRODO_SA_ID: '',
        FRODO_SA_JWK: '',
      },
    });
  }

  /** Saves service accounts on the profile, without validating them against the tenant. */
  function addAccounts(...names) {
    for (const name of names) {
      const added = cli([
        'conn',
        'service-account',
        'add',
        'matrix',
        '--name',
        name,
        '--sa-id',
        `id-${name}`,
        '--sa-jwk-file',
        jwkFile,
        '--no-validate',
      ]);
      expect(added.status).toBe(0);
    }
  }

  const savedAccounts = () =>
    (
      JSON.parse(fs.readFileSync(profilesPath, 'utf8'))[tenant]
        .additionalServiceAccounts ?? []
    ).map((account) => account.name);

  function onTerminal(args, actions) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { ...noCredentials, FRODO_CONNECTION_PROFILES_PATH: profilesPath },
      args,
      actions,
    });
  }

  const requests = () => readRequests(recordPath);

  test(
    'remove picks the service account from the profile and removes it, without a request to the tenant',
    async () => {
      addAccounts('zion-sa', 'matrix-sa');
      const result = onTerminal(
        ['conn', 'service-account', 'remove', 'matrix'],
        [
          waitFor('Select service account to act on'),
          settle,
          { type: 'capture', label: 'picker' },
          // the rows keep the order of the profile: zion-sa, matrix-sa
          { type: 'key', name: 'down' },
          { type: 'key', name: 'enter' },
          ...answerReady({ clear: true }),
          { type: 'wait_exit', timeoutMs: 30000 },
          { type: 'sleep', ms: 300 },
        ]
      );
      expect(result.exitCode).toBe(0);
      const picker = lastFrame(result.captures.picker.plain);
      expect(picker).toContain('zion-sa');
      expect(picker).toContain('matrix-sa');
      // the description of a row is the id of the service account
      expect(picker).toContain('id-zion-sa');
      expect(picker).toContain('[ENTER] next');
      expect(result.plainOutput).toContain(
        "Removed additional service account 'matrix-sa'"
      );
      expect(savedAccounts()).toEqual(['zion-sa']);
      // no login, no call to the tenant of any kind
      expect(requests()).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'describe picks the service account and describes it, without a request to the tenant',
    async () => {
      addAccounts('zion-sa', 'matrix-sa');
      const result = onTerminal(
        ['conn', 'service-account', 'describe', 'matrix'],
        [
          waitFor('Select service account to act on'),
          settle,
          { type: 'key', name: 'enter' },
          waitFor('Ready to run\\?'),
          settle,
          { type: 'capture', label: 'ready' },
          { type: 'clear_output' },
          { type: 'key', name: 'enter' },
          { type: 'wait_exit', timeoutMs: 30000 },
          { type: 'sleep', ms: 300 },
        ]
      );
      expect(result.exitCode).toBe(0);
      expect(footer(lastFrame(result.captures.ready.plain))).toContain(
        '--name zion-sa'
      );
      expect(result.plainOutput).toContain('id-zion-sa');
      expect(result.plainOutput).not.toContain('matrix-sa');
      expect(requests()).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'the picker is opened for the host that was chosen in the pass',
    async () => {
      addAccounts('zion-sa', 'matrix-sa');
      const result = onTerminal(
        ['conn', 'service-account', 'remove'],
        [
          waitFor('Select service account to act on'),
          settle,
          { type: 'capture', label: 'picker' },
          { type: 'key', name: 'enter' },
          ...answerReady({ clear: true }),
          { type: 'wait_exit', timeoutMs: 30000 },
        ]
      );
      // the only saved profile is used without asking, as the command does
      expect(result.exitCode).toBe(0);
      expect(lastFrame(result.captures.picker.plain)).toContain('zion-sa');
      expect(savedAccounts()).toEqual(['matrix-sa']);
      expect(requests()).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'a declined pick (Escape) removes nothing, exit code 1',
    async () => {
      addAccounts('zion-sa', 'matrix-sa');
      const result = onTerminal(
        ['conn', 'service-account', 'remove', 'matrix'],
        [
          waitFor('Select service account to act on'),
          settle,
          { type: 'key', name: 'escape' },
          { type: 'wait_exit', timeoutMs: 30000 },
          { type: 'sleep', ms: 300 },
        ]
      );
      expect(result.exitCode).toBe(1);
      expect(result.plainOutput).not.toContain('Removed');
      expect(savedAccounts()).toEqual(['zion-sa', 'matrix-sa']);
      expect(requests()).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'a profile with one service account has nothing to choose: it is used without a question',
    async () => {
      addAccounts('zion-sa');
      const result = onTerminal(
        ['conn', 'service-account', 'remove', 'matrix'],
        [
          { type: 'wait_exit', timeoutMs: 30000 },
          { type: 'sleep', ms: 300 },
        ]
      );
      expect(result.exitCode).toBe(0);
      expect(result.plainOutput).not.toContain('Select service account');
      expect(savedAccounts()).toEqual([]);
      expect(requests()).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'a profile without service accounts says so and fails, naming nothing "undefined"',
    async () => {
      const result = onTerminal(
        ['conn', 'service-account', 'remove', 'matrix'],
        [
          { type: 'wait_exit', timeoutMs: 30000 },
          { type: 'sleep', ms: 300 },
        ]
      );
      expect(result.exitCode).toBe(1);
      expect(result.plainOutput).toContain(
        'There is no additional service account to choose from.'
      );
      expect(result.plainOutput).not.toContain('undefined');
      expect(requests()).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'a complete command line opens no picker, as before',
    async () => {
      addAccounts('zion-sa', 'matrix-sa');
      const result = onTerminal(
        ['conn', 'service-account', 'remove', 'matrix', '--name', 'zion-sa'],
        [
          { type: 'wait_exit', timeoutMs: 30000 },
          { type: 'sleep', ms: 300 },
        ]
      );
      expect(result.exitCode).toBe(0);
      expect(result.plainOutput).not.toContain('Select service account');
      expect(savedAccounts()).toEqual(['matrix-sa']);
    },
    TIMEOUT
  );

  test('without a terminal the command is what it was: --name is required, and nothing is listed', () => {
    addAccounts('zion-sa', 'matrix-sa');
    const result = cli(['conn', 'service-account', 'remove', 'matrix']);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      "required option '--name <name>' not specified"
    );
    expect(savedAccounts()).toEqual(['zion-sa', 'matrix-sa']);
  });
});
