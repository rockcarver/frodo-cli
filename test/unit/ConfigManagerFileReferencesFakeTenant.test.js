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
 * `hostile` are the references that must be refused (they go up, or hold a colon), and `entities` are what the tenant serves already.
 */
/** References that the library reads as references that go up, if the check lets them through: it removes every `C:` from a path after the check, and a backslash is a slash. `levels` is how far up the folder of the reference is listed. */
const colon = (levels) => [
  `${'..C:/'.repeat(levels)}decoy-c${levels}.txt`,
  `${'.C:./'.repeat(levels)}decoy-d${levels}.txt`,
  `${'..C:\\'.repeat(levels)}decoy-e${levels}.txt`,
  `C:${'..\\'.repeat(levels)}decoy-f${levels}.txt`,
  'a:b.js',
  `ABC:x${levels}.js`,
];
/** The references that go up with `/` and with `\`, two levels. */
const up2 = ['../../decoy-two.txt', '..\\..\\decoy-three.txt'];

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
    hostile: ['../decoy-one.txt', ...up2, ...colon(1)],
  },
  {
    command: 'connector-mappings (the file of the mapping)',
    commandName: 'connector-mappings',
    args: [],
    folder: 'sync/mappings/m2',
    entities: { sync: { _id: 'sync', mappings: [] } },
    files: (ref) => ({
      'sync/mappings/m2/m2.json': {
        name: 'm2',
        source: 'managed/alpha_user',
        target: 'system/ldap/account',
        file: ref,
      },
    }),
    control: { ref: 'm2.js', file: 'sync/mappings/m2/m2.js' },
    // the folder above is listed by the push, so the decoys are two levels up
    hostile: [...up2, ...colon(2)],
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
    hostile: [...up2, ...colon(2)],
  },
  ...[
    [
      'schedules (a schedule that invokes a script)',
      'script',
      (ref) => ({ script: { type: 'text/javascript', file: ref } }),
    ],
    [
      'schedules (a schedule that scans tasks)',
      'taskscanner',
      (ref) => ({ task: { script: { type: 'text/javascript', file: ref } } }),
    ],
  ].map(([command, invokeService, invokeContext]) => ({
    command,
    commandName: 'schedules',
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
        invokeService,
        invokeContext: invokeContext(ref),
      },
    }),
    control: { ref: 'sch1.js', file: 'schedules/sch1/sch1.js' },
    hostile: [...up2, ...colon(2)],
  })),
  ...['html', 'message', 'styles'].map((field) => ({
    command: `email-templates (${field})`,
    commandName: 'email-templates',
    args: [],
    folder: 'email-templates/t1',
    entities: {},
    files: (ref) => ({
      'email-templates/t1/t1.json': {
        _id: 'emailTemplate/t1',
        enabled: true,
        defaultLocale: 'en',
        displayName: 't1',
        [field]: field === 'styles' ? { file: ref } : { en: { file: ref } },
      },
    }),
    control: { ref: 't1.en.html', file: 'email-templates/t1/t1.en.html' },
    hostile: [...up2, ...colon(2)],
  })),
  {
    command: 'scripts',
    args: [],
    folder: 'realms/alpha/scripts',
    entities: {},
    files: (ref) => ({
      'realms/alpha/scripts/scripts-config/s1.json': {
        _id: 's1',
        name: 's1',
        context: 'AUTHENTICATION_TREE_DECISION_NODE',
        language: 'JAVASCRIPT',
        script: { file: ref },
      },
    }),
    control: {
      ref: 'scripts-content/s1.js',
      file: 'realms/alpha/scripts/scripts-content/s1.js',
      base64: true,
    },
    // the fake tenant answers the update of a script with an error after the write: the control run exits with 1
    controlExit: 1,
    hostile: ['../decoy-one.txt', ...up2, ...colon(1)],
  },
  ...[
    [
      'terms-and-conditions (the version)',
      (ref) => ({ version: ref, language: 'en' }),
      (ref) => ref,
      (ref) => `terms-conditions/${ref}/en.html`,
    ],
    [
      'terms-and-conditions (the language)',
      (ref) => ({ version: '0.1', language: ref }),
      (ref) => `${ref}.html`,
      (ref) => `terms-conditions/0.1/${ref}.html`,
    ],
  ].map(([command, shape, says, decoyPath]) => ({
    command,
    commandName: 'terms-and-conditions',
    args: [],
    folder: 'terms-conditions',
    entities: {},
    files: (ref) => {
      const { version, language } = shape(ref);
      return {
        'terms-conditions/terms-conditions.json': {
          _id: 'selfservice.terms',
          versions: [{ version, termsTranslations: { [language]: 'x' } }],
        },
      };
    },
    colonFile: command.includes('version')
      ? 'terms-conditions/sub/a:b.js/en.html'
      : 'terms-conditions/0.1/sub/a:b.js.html',
    control: {
      ref: command.includes('version') ? '0.1' : 'en',
      file: 'terms-conditions/0.1/en.html',
    },
    says,
    decoyPath,
    hostile: [
      '../decoy-one',
      '../../decoy-two',
      '..C:/decoy-c1',
      '..C:/..C:/decoy-c2',
      '.C:./decoy-d1',
      'a:b',
    ],
  })),
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
    async function runAgainst(entities, args, fakeOptions = {}) {
      fakeAm = await startFakeAm({
        journey: 'service-account',
        recordPath: record,
        idmEntities: structuredClone(entities),
        ...fakeOptions,
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
        runAgainst(entities, [
          'config-manager',
          'push',
          c.commandName ?? c.command,
          ...c.args,
        ]);
      const rewritten = (reference) =>
        reference.replaceAll('\\', '/').replaceAll('C:', '');

      it.each(c.hostile.map((reference) => [reference]))(
        'the reference %j is refused: exit 1, and no write holds what the decoy file holds',
        async (reference) => {
          write(c.files(reference));
          // the files that the reference reaches, as the old code read it and as the library reads it once it has removed every `C:`
          const decoyOf = (ref) =>
            c.decoyPath ? c.decoyPath(ref) : path.posix.join(c.folder, ref);
          const decoys = new Set(
            [
              decoyOf(reference.replaceAll('\\', '/')),
              decoyOf(rewritten(reference)),
            ].map((relative) => path.resolve(work, relative))
          );
          for (const decoy of decoys) {
            fs.mkdirSync(path.dirname(decoy), { recursive: true });
            fs.writeFileSync(decoy, MARKER);
          }

          const { code, output } = await push();

          expect(output).toContain(
            `The file reference '${c.says ? c.says(reference) : reference}' must stay inside the config folder.`
          );
          expect(JSON.stringify(readRequests(record))).not.toContain(MARKER);
          expect(writes()).toEqual([]);
          expect(code).toBe(1);
        },
        TIMEOUT
      );

      it(
        'the reference as pull writes it is read: one write holds the text of the file',
        async () => {
          write(c.files(c.control.ref));
          write({ [c.control.file]: 'CONTROL-TEXT-3e9a' });

          const { code, output } = await push();

          expect(output).not.toContain('must stay inside the config folder');
          // a script is sent as base64
          expect(JSON.stringify(writes())).toContain(
            c.control.base64
              ? Buffer.from('CONTROL-TEXT-3e9a').toString('base64')
              : 'CONTROL-TEXT-3e9a'
          );
          expect(code).toBe(c.controlExit ?? 0);
        },
        TIMEOUT
      );

      it(
        'a colon that is not a drive letter or `C:` is an ordinary character of a reference: the file is read',
        async () => {
          write(c.files('sub/a:b.js'));
          write({
            [c.colonFile ?? path.posix.join(c.folder, 'sub/a:b.js')]:
              'CONTROL-TEXT-3e9a',
          });

          const { code, output } = await push();

          expect(output).not.toContain('must stay inside the config folder');
          expect(JSON.stringify(writes())).toContain(
            c.control.base64
              ? Buffer.from('CONTROL-TEXT-3e9a').toString('base64')
              : 'CONTROL-TEXT-3e9a'
          );
          expect(code).toBe(c.controlExit ?? 0);
        },
        TIMEOUT
      );
    });

    /** A journey as pull writes it: the folder, the file of the journey and one node. */
    const journey = (name) => ({
      [`realms/alpha/journeys/${name}/${name}.json`]: {
        _id: name,
        entryNodeId: 'n1',
        nodes: {
          n1: {
            displayName: 'n1',
            nodeType: 'ScriptedDecisionNode',
            x: 0,
            y: 0,
            connections: {},
          },
        },
        staticNodes: {},
      },
      [`realms/alpha/journeys/${name}/nodes/n1.json`]: {
        _id: 'n1',
        _type: { _id: 'ScriptedDecisionNode' },
        script: 'none',
        outcomes: ['true'],
        inputs: ['*'],
        outputs: ['*'],
      },
    });

    // a colon that the library does not rewrite is part of a name, which a pull writes as it is: what
    // a pull writes is pushed, also by a push of everything (the folder is found, not skipped)
    describe.each([
      {
        command: 'managed-objects',
        args: ['-i', 'Login:SSO'],
        entities: { managed: { _id: 'managed', objects: [] } },
        files: {
          'managed-objects/Login:SSO/Login:SSO.json': {
            name: 'Login:SSO',
            schema: { type: 'object', properties: {} },
          },
        },
      },
      {
        command: 'connector-mappings',
        args: ['-i', 'Login:SSO'],
        entities: { sync: { _id: 'sync', mappings: [] } },
        files: {
          'sync/mappings/Login:SSO/Login:SSO.json': {
            name: 'Login:SSO',
            source: 'managed/alpha_user',
            target: 'system/ldap/account',
          },
        },
      },
      {
        command: 'journeys',
        args: [],
        entities: {},
        files: { ...journey('Plain'), ...journey('Login:SSO') },
        exit: 1,
        attempted: [
          '2 of 2 journeys failed',
          'journey Login:SSO',
          'journey Plain',
        ],
        // the fake tenant answers the lists that a push of journeys reads as empty
        fakeOptions: { emptyCollections: true },
      },
    ])('push $command, a name with a colon', (c) => {
      it(
        'is found as it is, and not skipped',
        async () => {
          write(c.files);

          const { code, output } = await runAgainst(
            c.entities,
            ['config-manager', 'push', c.command, ...c.args],
            c.fakeOptions
          );

          expect(output).not.toContain('No journey files found');
          if (c.attempted) {
            // the fake tenant has no routes for the nodes of a journey, so every journey fails on the
            // tenant: what counts is that both were attempted, and the folder with the colon was not skipped
            expect(output).not.toContain('No journey files found');
            for (const text of c.attempted) expect(output).toContain(text);
          } else {
            expect(decodeURIComponent(JSON.stringify(writes()))).toContain(
              'Login:SSO'
            );
          }
          expect(code).toBe(c.exit ?? 0);
        },
        TIMEOUT
      );
    });
  }
);
