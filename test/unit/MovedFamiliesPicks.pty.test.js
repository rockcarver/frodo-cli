import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  firstRequestIndex,
  loginCount,
  readRequests,
} from '../utils/FakeAmLog.js';
import { answerReady } from '../utils/ReadyStep.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * Decision records 0017, 0038 and 0044, on a real terminal against a fake cloud
 * tenant: the commands that used to register their own entity picker
 * (`esv secret delete`, `esv secret version create`, `service delete`) get it
 * from their command family now. The pass logs in for it, the pick fills the
 * option, and a bulk delete is reachable only through a pick that happened: a
 * declined pick, a failed load and a tenant without anything to pick end the
 * command without a single delete. The request log of the fake tenant is the
 * proof of what ran.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

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

/** The last frame a capture holds. */
const lastFrame = (plain) => plain.split('┌ Navigate').pop();
/** The command as the footer of a frame shows it. */
const footer = (frame) => frame.split('└').pop();

const waitFor = (regex) => ({
  type: 'wait_plain',
  regex,
  timeoutMs: 30000,
});
const settle = { type: 'sleep', ms: 500 };

suite(
  'the commands that moved their entity picker to the registry, on a real terminal',
  () => {
    let home;
    let recordPath;
    let fakeAm;
    let jwk;

    beforeAll(() => {
      ensureFrodoArtifact();
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      });
      jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
    });

    beforeEach(() => {
      home = createShellTestHome();
      recordPath = path.join(home, 'requests.jsonl');
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      removeShellTestHome(home);
    });

    /** A fake cloud tenant that records its requests; `options` say what it holds. */
    async function startTenant(options = {}) {
      fakeAm = await startFakeAm({
        recordPath,
        journey: 'service-account',
        ...options,
      });
      return `http://127.0.0.1:${fakeAm.port}/am`;
    }

    /** Runs the command on a terminal, logging in with a service account. */
    function run(tenant, args, actions) {
      return runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: {
          ...noCredentials,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          FRODO_SA_ID: 'test-account',
          FRODO_SA_JWK: jwk,
        },
        args: [...args, tenant, 'alpha', '--type', 'cloud'],
        actions,
      });
    }

    const requests = () => readRequests(recordPath);
    const calls = (method, text) =>
      requests().filter(
        (request) => request.method === method && request.url.includes(text)
      );
    /** The requests that change the tenant. */
    const writes = () =>
      requests().filter((request) =>
        ['DELETE', 'PUT', 'PATCH'].includes(request.method)
      );

    /** `-i` chosen from the menu of `esv secret delete`; the picker of the secrets opens. */
    const chooseSecretOption = [
      waitFor('Choose which secrets'),
      settle,
      { type: 'key', name: 'enter' },
    ];

    describe('esv secret delete', () => {
      test(
        'logs in for the picker, deletes the secret that was picked and no other',
        async () => {
          const tenant = await startTenant({
            secrets: ['zion-secret', 'matrix-secret'],
          });
          const result = run(
            tenant,
            ['esv', 'secret', 'delete'],
            [
              ...chooseSecretOption,
              waitFor('Select secret to act on'),
              settle,
              { type: 'capture', label: 'picker' },
              { type: 'key', name: 'down' },
              { type: 'key', name: 'enter' },
              ...answerReady(),
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(0);
          // the picker is a prompt of the pass: Enter says next
          expect(lastFrame(result.captures.picker.plain)).toContain(
            '[ENTER] next'
          );
          expect(result.plainOutput).toContain('Deleted secret matrix-secret');
          // exactly one delete, of the secret that was picked
          expect(writes().map((request) => request.url)).toEqual([
            '/environment/secrets/matrix-secret',
          ]);
          // one login, made before the secrets were listed
          const log = requests();
          expect(firstRequestIndex(log, '/access_token')).toBeGreaterThan(-1);
          expect(firstRequestIndex(log, '/access_token')).toBeLessThan(
            firstRequestIndex(log, '/environment/secrets')
          );
          expect(calls('GET', '/access_token')).toEqual([]);
          expect(
            log.filter((r) => r.url.includes('/access_token'))
          ).toHaveLength(1);
        },
        TIMEOUT
      );

      test(
        'a declined pick (Escape) never runs the command: nothing is deleted, exit code 1',
        async () => {
          const tenant = await startTenant({
            secrets: ['zion-secret', 'matrix-secret'],
          });
          const result = run(
            tenant,
            ['esv', 'secret', 'delete'],
            [
              ...chooseSecretOption,
              waitFor('Select secret to act on'),
              settle,
              { type: 'key', name: 'escape' },
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(1);
          expect(writes()).toEqual([]);
          expect(result.plainOutput).not.toContain('Ready to run?');
          expect(result.plainOutput).not.toContain('Deleted');
        },
        TIMEOUT
      );

      test(
        'a failed load prints its error and never reaches the delete of every secret',
        async () => {
          // the tenant does not answer the list of the secrets (404)
          const tenant = await startTenant();
          const result = run(
            tenant,
            ['esv', 'secret', 'delete'],
            [
              ...chooseSecretOption,
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(1);
          expect(result.plainOutput).toContain('Error reading secrets');
          expect(result.plainOutput).not.toContain('Ready to run?');
          expect(writes()).toEqual([]);
        },
        TIMEOUT
      );

      test(
        'a tenant without secrets says so, deletes nothing and does not turn the empty pick into a delete of everything',
        async () => {
          const tenant = await startTenant({ secrets: [] });
          const result = run(
            tenant,
            ['esv', 'secret', 'delete'],
            [
              ...chooseSecretOption,
              ...answerReady(),
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(1);
          expect(result.plainOutput).toContain(
            'There is no secret to choose from.'
          );
          expect(writes()).toEqual([]);
          // the list was read, so the pick ran, and then nothing else
          expect(calls('GET', '/environment/secrets')).toHaveLength(1);
        },
        TIMEOUT
      );

      test(
        'a complete command line opens no picker and reads no list',
        async () => {
          const tenant = await startTenant({ secrets: ['zion-secret'] });
          const result = runShellScenario({
            homeDir: home,
            allowPrompting: true,
            env: {
              ...noCredentials,
              FRODO_CONNECTION_PROFILES_PATH: path.join(
                home,
                'Connections.json'
              ),
              FRODO_SA_ID: 'test-account',
              FRODO_SA_JWK: jwk,
            },
            args: [
              'esv',
              'secret',
              'delete',
              '-i',
              'zion-secret',
              tenant,
              'alpha',
              '--type',
              'cloud',
            ],
            actions: [
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ],
          });
          expect(result.exitCode).toBe(0);
          expect(result.plainOutput).not.toContain('Select secret');
          expect(calls('GET', '/environment/secrets')).toEqual([]);
          expect(writes().map((request) => request.url)).toEqual([
            '/environment/secrets/zion-secret',
          ]);
        },
        TIMEOUT
      );
    });

    describe('esv secret version create', () => {
      test(
        'picks the secret the version is added to, which --secret-id would have named',
        async () => {
          const tenant = await startTenant({
            secrets: ['zion-secret', 'matrix-secret'],
          });
          const result = run(
            tenant,
            ['esv', 'secret', 'version', 'create', '--value', 'not-a-secret'],
            [
              waitFor('Select secret to act on'),
              settle,
              { type: 'key', name: 'down' },
              { type: 'key', name: 'enter' },
              waitFor('Ready to run\\?'),
              settle,
              { type: 'capture', label: 'ready' },
              { type: 'key', name: 'enter' },
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(footer(lastFrame(result.captures.ready.plain))).toContain(
            '--secret-id matrix-secret'
          );
          // the version went to the secret that was picked
          const added = requests().filter(
            (request) =>
              request.method === 'POST' &&
              request.url.includes('/environment/secrets/') &&
              request.url.includes('versions')
          );
          expect(added.map((request) => request.url)).toEqual([
            expect.stringContaining(
              '/environment/secrets/matrix-secret/versions'
            ),
          ]);
          expect(loginCount(requests())).toBe(0);
          expect(
            requests().filter((r) => r.url.includes('/access_token'))
          ).toHaveLength(1);
        },
        TIMEOUT
      );

      test(
        'a declined pick adds no version',
        async () => {
          const tenant = await startTenant({
            secrets: ['zion-secret', 'matrix-secret'],
          });
          const result = run(
            tenant,
            ['esv', 'secret', 'version', 'create', '--value', 'not-a-secret'],
            [
              waitFor('Select secret to act on'),
              settle,
              { type: 'key', name: 'escape' },
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(1);
          expect(
            requests().filter((request) => request.url.includes('versions'))
          ).toEqual([]);
        },
        TIMEOUT
      );
    });

    describe('service delete', () => {
      const chooseServiceOption = [
        waitFor('Choose what to delete'),
        settle,
        { type: 'key', name: 'enter' },
      ];

      test(
        'picks the service to delete and deletes that one',
        async () => {
          const tenant = await startTenant({
            services: ['baseurl', 'authenticatorOath'],
          });
          const result = run(
            tenant,
            ['service', 'delete'],
            [
              ...chooseServiceOption,
              waitFor('Select service to act on'),
              settle,
              { type: 'capture', label: 'picker' },
              // the rows are sorted: authenticatorOath, baseurl
              { type: 'key', name: 'enter' },
              waitFor('Ready to run\\?'),
              settle,
              { type: 'capture', label: 'ready' },
              { type: 'key', name: 'enter' },
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          const picker = lastFrame(result.captures.picker.plain);
          expect(picker.indexOf('authenticatorOath')).toBeLessThan(
            picker.indexOf('baseurl')
          );
          expect(footer(lastFrame(result.captures.ready.plain))).toContain(
            '--id authenticatorOath'
          );
          // the services of the realm were listed, and only the picked one was addressed
          expect(
            calls('POST', '/realms/alpha/realm-config/services?_action')
          ).toHaveLength(1);
          const addressed = requests().filter((request) =>
            request.url.includes('/services/')
          );
          expect(addressed.length).toBeGreaterThan(0);
          for (const request of addressed) {
            expect(request.url).toContain('/services/authenticatorOath');
          }
        },
        TIMEOUT
      );

      test(
        '-g lists the global services, not those of the realm',
        async () => {
          const tenant = await startTenant({ services: ['baseurl'] });
          run(
            tenant,
            ['service', 'delete', '-g'],
            [
              ...chooseServiceOption,
              waitFor('Ready to run\\?'),
              settle,
              { type: 'key', name: 'escape' },
              { type: 'key', name: 'escape' },
              { type: 'wait_exit', timeoutMs: 30000 },
            ]
          );
          expect(
            calls(
              'POST',
              '/json/global-config/services?_action=nextdescendents'
            )
          ).toHaveLength(1);
          expect(calls('POST', '/realms/alpha/realm-config/services')).toEqual(
            []
          );
        },
        TIMEOUT
      );

      test(
        'a declined pick deletes nothing, exit code 1',
        async () => {
          const tenant = await startTenant({
            services: ['baseurl', 'authenticatorOath'],
          });
          const result = run(
            tenant,
            ['service', 'delete'],
            [
              ...chooseServiceOption,
              waitFor('Select service to act on'),
              settle,
              { type: 'key', name: 'escape' },
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(1);
          expect(writes()).toEqual([]);
          expect(
            requests().filter((request) => request.url.includes('/services/'))
          ).toEqual([]);
        },
        TIMEOUT
      );

      test(
        'a realm without services says so and does not turn the empty pick into a delete of every service',
        async () => {
          const tenant = await startTenant({ services: [] });
          const result = run(
            tenant,
            ['service', 'delete', '-y'],
            [
              ...chooseServiceOption,
              ...answerReady(),
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(1);
          expect(result.plainOutput).toContain(
            'There is no service to choose from.'
          );
          // -y is only the answer to the question of a delete of all of them: no
          // service was addressed, and the list was read once, for the pick
          expect(
            requests().filter((request) => request.url.includes('/services/'))
          ).toEqual([]);
          expect(calls('POST', '/realm-config/services?_action')).toHaveLength(
            1
          );
        },
        TIMEOUT
      );
    });
  }
);
