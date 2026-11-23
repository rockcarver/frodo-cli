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
 * A realm that a tenant lists is a folder of the config folder: a name or a path of names, never a path
 * of the file system. ConfigManagerPullHostileNames.test.js has the table (every family of pull x
 * every name, the library faked); here the REAL CLI of this checkout is run against a fake AM (test/utils/FakeAm.mjs,
 * in a separate process), through the real library, with a tenant that lists a realm that goes up. For
 * each of three commands:
 *
 * - the command exits with 1 and says which realm is not a name and that its objects are not pulled;
 * - the other realm is pulled (its request is in the log of the tenant), and no request names the
 *   hostile realm;
 * - everything outside the config folder is what it was before: the decoy files, byte for byte, and no
 *   new folder.
 *
 * No tenant, no secrets, no master key, no terminal; a temporary HOME and working directory keep it
 * away from real profiles and files. Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

/** The realms that a tenant could list, and what the CLI says about them. */
const REALMS = ['../escape', '../../escape', '..\\escape', '..', '..C:/escape'];

const COMMANDS = [
  { command: 'services', fakeOptions: { services: [] }, left: 'services' },
  { command: 'journeys', fakeOptions: { trees: [] }, left: 'journeys' },
  {
    command: 'scripts',
    // the fake serves the scripts of the realm that is a name: the file of one is the proof that it was pulled
    fakeOptions: { scripts: ['Fine'] },
    left: 'scripts',
    written:
      'realms/alpha/scripts/scripts-content/SOCIAL_IDP_PROFILE_TRANSFORMATION/Fine.js',
  },
];

const CONTEXT = 'SOCIAL_IDP_PROFILE_TRANSFORMATION';

/** The names of scripts that the fake serves: the file that a pull makes of each, and the exit code. */
const SCRIPT_NAMES = [
  ['../../escape', '..%2F..%2Fescape', 0],
  ['..\\escape', '..%5Cescape', 0],
  ['/etc/escape', '%2Fetc%2Fescape', 0],
  ['a/b', 'a%2Fb', 0],
  ['..', undefined, 1],
  ['...', undefined, 1],
];

suite(
  'a realm that a tenant lists is a folder, never a path (fake tenant)',
  () => {
    let home;
    let work;
    let record;
    let fakeAm;

    beforeAll(() => {
      ensureFrodoArtifact();
    });

    beforeEach(() => {
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-home-'));
      // the config folder is deep inside a folder that holds decoys, where a realm that goes up would land
      const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-pull-outer-'));
      work = path.join(outer, 'a', 'b', 'tree');
      fs.mkdirSync(work, { recursive: true });
      for (const decoy of [
        path.join(outer, 'a', 'b', 'DECOY.json'),
        path.join(outer, 'a', 'DECOY.json'),
        path.join(outer, 'DECOY.json'),
      ]) {
        fs.writeFileSync(decoy, '{"decoy":true}');
      }
      record = path.join(home, 'requests.jsonl');
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(path.resolve(work, '..', '..', '..'), {
        recursive: true,
        force: true,
      });
    });

    /** Every file and folder below a folder, with the bytes of a file. */
    const snapshot = (folder, skip) => {
      const found = {};
      const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (full === skip) continue;
          const relative = path.relative(folder, full);
          if (entry.isDirectory()) {
            found[`${relative}/`] = '';
            walk(full);
          } else {
            found[relative] = fs.readFileSync(full, 'utf8');
          }
        }
      };
      walk(folder);
      return found;
    };

    async function pull(command, realm, fakeOptions) {
      fakeAm = await startFakeAm({
        journey: 'service-account',
        recordPath: record,
        realms: realm === undefined ? ['alpha'] : ['alpha', realm],
        ...fakeOptions,
      });
      return new Promise((resolve, reject) => {
        const child = cp.spawn(
          binaryPath,
          [
            'config-manager',
            'pull',
            command,
            `http://127.0.0.1:${fakeAm.port}/am`,
            '--type',
            'cloud',
          ],
          {
            cwd: work,
            env: {
              ...process.env,
              HOME: home,
              USERPROFILE: home,
              FRODO_REALM: '',
              FRODO_TEST: '',
              FRODO_NO_CACHE: 'true',
              FRODO_NO_PROMPT: '1',
              FRODO_SA_ID: 'test-account',
              FRODO_SA_JWK: serviceAccountJwk,
              NODE_OPTIONS: '',
              NO_COLOR: '1',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        );
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, output }));
      });
    }

    describe.each(COMMANDS)(
      'pull $command',
      ({ command, fakeOptions, left, written }) => {
        it.each(REALMS.map((realm) => [realm]))(
          'the realm %j is a failure of that realm: exit 1, nothing outside the config folder is touched',
          async (realm) => {
            const outer = path.resolve(work, '..', '..', '..');
            const before = snapshot(outer, work);

            const { code, output } = await pull(command, realm, fakeOptions);

            expect(code).toBe(1);
            expect(output).toContain(
              `is not '/', a name or a path of names. Its ${left} are not pulled.`
            );
            expect(snapshot(outer, work)).toEqual(before);
            // the realm of the tenant that is a name is pulled; the other is never asked for anything
            const urls = readRequests(record).map(({ url }) => url);
            expect(urls.some((url) => url.includes('/realms/alpha/'))).toBe(
              true
            );
            expect(urls.filter((url) => url.includes('escape'))).toEqual([]);
            // and what that realm has is written
            if (written) {
              expect(fs.existsSync(path.join(work, written))).toBe(true);
            }
          },
          TIMEOUT
        );
      }
    );

    describe('pull scripts: the name of a script that the tenant serves', () => {
      it.each(SCRIPT_NAMES)(
        'the name %j is the file %j in the folder of the scripts, and the exit code is %j',
        async (name, file, exit) => {
          const outer = path.resolve(work, '..', '..', '..');
          const before = snapshot(outer, work);

          const { code, output } = await pull('scripts', undefined, {
            scripts: [name, 'Fine'],
          });

          expect(code).toBe(exit);
          expect(snapshot(outer, work)).toEqual(before);
          const content = path.join(
            work,
            'realms/alpha/scripts/scripts-content',
            CONTEXT
          );
          // the other script is pulled whatever the name of this one is
          expect(fs.readdirSync(content)).toContain('Fine.js');
          if (file) {
            expect(fs.readdirSync(content)).toContain(`${file}.js`);
          } else {
            expect(output).toContain('does not name an object');
            expect(fs.readdirSync(content)).toEqual(['Fine.js']);
          }
        },
        TIMEOUT
      );
    });
  }
);
