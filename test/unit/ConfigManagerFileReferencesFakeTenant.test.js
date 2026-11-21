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
 * A file reference in a file of the config tree names a file of the folder it is relative to
 * (ConfigManagerFileReferences.test.js has the operations, one row for each place). Here four of the
 * push commands that follow such a reference are run as the REAL CLI of this checkout against a fake
 * AM (test/utils/FakeAm.mjs, in a separate process), through the real library, and the log of the
 * requests the tenant received says what would have reached it:
 *
 * - a reference that goes up out of the folder (one or two levels, with `/` and with `\`) is
 *   refused: the command exits with 1, says which reference, and the tenant receives no write that
 *   holds what the decoy file outside the folder holds;
 * - the same command with a reference as pull writes it sends one write whose body holds the text of
 *   the file, and exits with 0.
 *
 * No tenant, no secrets, no master key, no terminal; a temporary HOME and working directory keep it
 * away from real profiles and files. Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

/** What the decoy files hold: if a write of the tenant carries it, a file outside the folder was read. */
const MARKER = 'DECOY-MARKER-77d1';

/**
 * The four commands. `files(ref)` are the files of the tree (a folder that holds the object, with
 * `ref` as the reference), `control` is the reference as pull writes it and the file it names,
 * `hostile` are the references that go up, and `entities` are what the tenant serves already.
 */
const COMMANDS = [
  {
    command: 'connector-mappings',
    args: ['-i', 'm1'],
    folder: 'sync/mappings/m1',
    entities: { sync: { _id: 'sync', mappings: [] } },
    files: (ref) => ({
      'sync/mappings/m1/m1.json': {
        name: 'm1',
        source: 'managed/alpha_user',
        target: 'system/ldap/account',
        onCreate: { type: 'text/javascript', file: ref },
      },
    }),
    control: { ref: 'm1.onCreate.js', file: 'sync/mappings/m1/m1.onCreate.js' },
    // the push names the mapping, so the folder above is not listed
    hostile: [
      '../decoy-one.txt',
      '../../decoy-two.txt',
      '..\\..\\decoy-three.txt',
    ],
  },
  {
    command: 'endpoints',
    args: [],
    folder: 'endpoints/e1',
    entities: {},
    files: (ref) => ({
      'endpoints/e1/e1.json': {
        _id: 'endpoint/e1',
        context: 'endpoint/e1',
        type: 'text/javascript',
        file: ref,
      },
    }),
    control: { ref: 'e1.js', file: 'endpoints/e1/e1.js' },
    // the folder above is listed by the push, so the decoys are two levels up
    hostile: ['../../decoy-two.txt', '..\\..\\decoy-three.txt'],
  },
  {
    command: 'schedules',
    args: [],
    folder: 'schedules/sch1',
    entities: {},
    files: (ref) => ({
      'schedules/sch1/sch1.json': {
        _id: 'schedule/sch1',
        enabled: false,
        persisted: true,
        type: 'cron',
        schedule: '0 0 * * * ?',
        invokeService: 'script',
        invokeContext: { script: { type: 'text/javascript', file: ref } },
      },
    }),
    control: { ref: 'sch1.js', file: 'schedules/sch1/sch1.js' },
    // the folder above is listed by the push, so the decoys are two levels up
    hostile: ['../../decoy-two.txt', '..\\..\\decoy-three.txt'],
  },
  {
    command: 'email-templates',
    args: [],
    folder: 'email-templates/t1',
    entities: {},
    files: (ref) => ({
      'email-templates/t1/t1.json': {
        _id: 'emailTemplate/t1',
        enabled: true,
        defaultLocale: 'en',
        displayName: 't1',
        html: { en: { file: ref } },
      },
    }),
    control: { ref: 't1.en.html', file: 'email-templates/t1/t1.en.html' },
    // the folder above is listed by the push, so the decoys are two levels up
    hostile: ['../../decoy-two.txt', '..\\..\\decoy-three.txt'],
  },
];

suite(
  'a file reference must stay inside the config folder (fake tenant)',
  () => {
    let home;
    let work;
    let record;
    let fakeAm;

    beforeAll(() => {
      ensureFrodoArtifact();
    });

    beforeEach(() => {
      home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-refs-home-'));
      work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-refs-work-'));
      record = path.join(home, 'requests.jsonl');
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(work, { recursive: true, force: true });
    });

    /** Starts the fake and runs the CLI once against it, without a terminal. */
    async function runAgainst(entities, args) {
      fakeAm = await startFakeAm({
        journey: 'service-account',
        recordPath: record,
        idmEntities: structuredClone(entities),
      });
      return new Promise((resolve, reject) => {
        const child = cp.spawn(
          binaryPath,
          [
            ...args,
            `http://127.0.0.1:${fakeAm.port}/am`,
            'alpha',
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

    const write = (files) => {
      for (const [relative, content] of Object.entries(files)) {
        const target = path.join(work, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(
          target,
          typeof content === 'string' ? content : JSON.stringify(content)
        );
      }
    };

    /** The requests that change a tenant. */
    const writes = () =>
      readRequests(record).filter(
        ({ method, url }) =>
          ['PUT', 'PATCH', 'DELETE'].includes(method) ||
          (method === 'POST' &&
            !url.includes('/authenticate') &&
            !url.includes('/oauth2/access_token'))
      );

    describe.each(COMMANDS)('push $command', (c) => {
      const push = (entities = c.entities) =>
        runAgainst(entities, ['config-manager', 'push', c.command, ...c.args]);

      it.each(c.hostile.map((reference) => [reference]))(
        'the reference %j is refused: exit 1, and no write holds what the decoy file holds',
        async (reference) => {
          write(c.files(reference));
          // the file that the reference reaches from the folder of the object, as the old code read it
          const decoy = path.resolve(
            work,
            c.folder,
            reference.replaceAll('\\', '/')
          );
          fs.mkdirSync(path.dirname(decoy), { recursive: true });
          fs.writeFileSync(decoy, MARKER);

          const { code, output } = await push();

          expect(output).toContain(
            `The file reference '${reference}' must stay inside the config folder.`
          );
          expect(JSON.stringify(readRequests(record))).not.toContain(MARKER);
          expect(writes()).toEqual([]);
          expect(code).toBe(1);
        },
        TIMEOUT
      );

      it(
        'the reference as pull writes it is read: one write holds the text of the file, exit 0',
        async () => {
          write(c.files(c.control.ref));
          write({ [c.control.file]: 'CONTROL-TEXT-3e9a' });

          const { code, output } = await push();

          expect(output).not.toContain('must stay inside the config folder');
          expect(JSON.stringify(writes())).toContain('CONTROL-TEXT-3e9a');
          expect(code).toBe(0);
        },
        TIMEOUT
      );
    });
  }
);
