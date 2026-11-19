import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * A selector (-i, -n, --name) is an id or a name, never a path, and a realm is a name or a
 * path of names: checked with the REAL CLI of this checkout against a fake AM (test/utils/FakeAm.mjs,
 * in a separate process), through the real library. What the unit tests of the operations
 * stub, this shows in the log of the requests the tenant received:
 *
 * - `delete secret-mappings -i <id>` reads the list of the mappings first and deletes the mapping
 *   that the list holds: an id that is not a mapping (`..`, `a#b`) never reaches a URL, so the
 *   only requests are the list and the delete of a listed mapping;
 * - `push oauth-issuers -i ../x` does not read a file one level above the folder of the type,
 *   so nothing is sent for it;
 * - a realm that is not a name or a path of names (`../../alpha`) is refused before the command
 *   logs in: the tenant receives no request at all, also when the realm comes from FRODO_REALM.
 *
 * No tenant, no secrets, no master key, no terminal; a temporary HOME and working directory keep
 * it away from real profiles and files. Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const STORE_TYPE = 'GoogleSecretManagerSecretStoreProvider';
const SECRET_STORES = {
  stores: [{ _id: 'ESV', type: STORE_TYPE }],
  mappings: {
    ESV: [
      { secretId: 'am.zion.one', aliases: ['zion-one'] },
      { secretId: 'am.zion.two', aliases: ['zion-two'] },
    ],
  },
};

suite('a selector is an id or a name, never a path (fake tenant)', () => {
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-paths-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-paths-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts the fake and returns a function that runs the CLI once against it. */
  async function tenant(options, credentials) {
    fakeAm = await startFakeAm({ recordPath: record, ...options });
    return (args, extraEnvironment = {}) =>
      new Promise((resolve, reject) => {
        const child = cp.spawn(binaryPath, args, {
          cwd: work,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_HOST: `http://127.0.0.1:${fakeAm.port}/am`,
            FRODO_REALM: '',
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            FRODO_NO_PROMPT: '1',
            NODE_OPTIONS: '',
            NO_COLOR: '1',
            ...credentials,
            ...extraEnvironment,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, output }));
      });
  }

  const plainLogin = {
    FRODO_USERNAME: 'someone@example.com',
    FRODO_PASSWORD: 'secret',
  };
  const serviceAccount = {
    FRODO_SA_ID: 'test-account',
    FRODO_SA_JWK: serviceAccountJwk,
  };

  const host = () => `http://127.0.0.1:${fakeAm.port}/am`;
  const requests = () => readRequests(record);
  const forget = () => fs.rmSync(record, { force: true });

  describe('delete secret-mappings -i', () => {
    /** The requests that reached a secret store, as `METHOD path-after-the-store-type`. */
    const storeCalls = () =>
      requests()
        .filter(({ url }) => url.includes('/secrets/stores/'))
        .map(({ method, url }) => {
          const path = url.split('?')[0];
          return `${method} ${path.slice(path.indexOf(STORE_TYPE) + STORE_TYPE.length)}`;
        });

    const deleteMapping = (run, id, ...extra) =>
      run([
        'config-manager',
        'delete',
        'secret-mappings',
        '-i',
        id,
        ...extra,
        host(),
        'alpha',
        '--type',
        'cloud',
      ]);

    it(
      'reads the list of the mappings first and deletes the mapping that the list holds',
      async () => {
        const run = await tenant(
          { journey: 'service-account', secretStores: SECRET_STORES },
          serviceAccount
        );

        const { code, output } = await deleteMapping(run, 'am.zion.two');

        expect(output).toContain("Deleting secret ID mapping 'am.zion.two'");
        expect(storeCalls()).toEqual([
          'GET /ESV/mappings',
          'DELETE /ESV/mappings/am.zion.two',
        ]);
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'a dry run reads the list and deletes nothing',
      async () => {
        const run = await tenant(
          { journey: 'service-account', secretStores: SECRET_STORES },
          serviceAccount
        );

        const { code, output } = await deleteMapping(
          run,
          'am.zion.two',
          '--dry-run'
        );

        expect(output).toContain(
          "Dry run: Deleting secret ID mapping 'am.zion.two'"
        );
        expect(storeCalls()).toEqual(['GET /ESV/mappings']);
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      'an id that is not a mapping is not put into any URL: one read of the list, no delete, exit 1, also with a dry run and with --allow-failures',
      async () => {
        const run = await tenant(
          { journey: 'service-account', secretStores: SECRET_STORES },
          serviceAccount
        );

        for (const id of [
          '..',
          '.',
          '%2e%2e',
          'a#b',
          'a?b=c',
          '../ESV',
          'AM.ZION.TWO',
        ]) {
          for (const extra of [[], ['--dry-run'], ['--allow-failures']]) {
            forget();

            const { code, output } = await deleteMapping(run, id, ...extra);

            expect([id, extra, storeCalls()]).toEqual([
              id,
              extra,
              ['GET /ESV/mappings'],
            ]);
            expect(output).toContain(
              `Secret mapping '${id}' not found in realm 'alpha'.`
            );
            expect(code).toBe(1);
          }
        }
      },
      TIMEOUT * 4
    );
  });

  describe('push oauth-issuers -i', () => {
    const issuerOf = (id) => ({
      _id: id,
      _type: {
        _id: 'TrustedJwtIssuer',
        name: 'OAuth2 Trusted JWT Issuer',
        collection: true,
      },
      issuer: { inherited: false, value: `https://${id}.example.com` },
    });
    const writeIssuer = (folder, id) => {
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(
        path.join(folder, `${id}.json`),
        JSON.stringify(issuerOf(id))
      );
    };
    const agents = path.join('realms', 'alpha', 'realm-config', 'agents');
    const puts = () => requests().filter(({ method }) => method === 'PUT');

    it(
      'does not read a file above the folder of the type: a decoy one or two levels up is never sent',
      async () => {
        const run = await tenant(
          { journey: 'password', oauthIssuers: [] },
          plainLogin
        );
        writeIssuer(path.join(work, agents), 'decoy-one');
        writeIssuer(
          path.join(work, 'realms', 'alpha', 'realm-config'),
          'decoy-two'
        );

        for (const id of ['../decoy-one', '../../decoy-two']) {
          forget();

          const { code, output } = await run([
            'config-manager',
            'push',
            'oauth-issuers',
            '-i',
            id,
            host(),
            'alpha',
          ]);

          expect([id, puts()]).toEqual([id, []]);
          expect(output).toContain(
            `No trusted JWT issuer file '${id.replaceAll('/', '%2F')}.json' in`
          );
          expect(code).toBe(1);
        }
      },
      TIMEOUT
    );

    it(
      'still pushes the issuer of a plain id',
      async () => {
        const run = await tenant(
          { journey: 'password', oauthIssuers: [] },
          plainLogin
        );
        writeIssuer(path.join(work, agents, 'TrustedJwtIssuer'), 'zion-one');

        const { code } = await run([
          'config-manager',
          'push',
          'oauth-issuers',
          '-i',
          'zion-one',
          host(),
          'alpha',
        ]);

        expect(puts().length).toBeGreaterThan(0);
        expect(code).toBe(0);
      },
      TIMEOUT
    );
  });

  describe('the realm', () => {
    const COMMANDS = [
      ['config-manager', 'push', 'journeys'],
      ['config-manager', 'pull', 'scripts'],
      ['config-manager', 'delete', 'secret-mappings'],
    ];
    const HOSTILE = [
      '..',
      '../../alpha',
      'alpha/..',
      'a\\b',
      'a?b',
      'a#b',
      'a%2e%2e',
    ];

    it(
      'is refused before the command logs in, so the tenant receives nothing: exit 1',
      async () => {
        const run = await tenant({ journey: 'password' }, plainLogin);

        for (const command of COMMANDS) {
          for (const realm of HOSTILE) {
            forget();

            const { code, output } = await run([
              ...command,
              host(),
              realm,
              '--type',
              'cloud',
            ]);

            expect([...command, realm, requests()]).toEqual([
              ...command,
              realm,
              [],
            ]);
            expect(output).toContain(
              `command-argument value '${realm}' is invalid for argument 'realm'`
            );
            expect(code).toBe(1);
          }
        }
      },
      TIMEOUT * 4
    );

    it(
      'is refused when it comes from FRODO_REALM, the default of the argument',
      async () => {
        const run = await tenant({ journey: 'password' }, plainLogin);

        const { code, output } = await run(
          ['config-manager', 'push', 'journeys', host()],
          { FRODO_REALM: '../../alpha' }
        );

        expect(requests()).toEqual([]);
        expect(output).toContain(
          "command-argument value '../../alpha' is invalid for argument 'realm'"
        );
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      'is not refused when it is a name, a path of names or the root realm: the command goes on to log in',
      async () => {
        const run = await tenant({ journey: 'password' }, plainLogin);

        for (const realm of ['alpha', '/alpha', '/parent/child', '/']) {
          forget();

          await run(['config-manager', 'push', 'journeys', host(), realm]);

          expect([realm, requests().length > 0]).toEqual([realm, true]);
        }
      },
      TIMEOUT * 2
    );
  });
});
