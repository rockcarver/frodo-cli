import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * Decision record 0040 for the imports of `realm import`, `role import`,
 * `saml import`, `saml cot import`, `idp import`, `app import` and
 * `oauth client import`, driven through the REAL CLI of this checkout: the
 * unit test of the ops functions (BulkImportRealmAndProviderFailures) cannot
 * show that a command hands `--allow-failures` on to its ops function or what
 * a failed login ends with.
 *
 * It uses the fake AM of test/utils/FakeAm.mjs in a separate process (journey
 * `password`: a login that succeeds and answers 404 to everything after it, so
 * every item of an import fails on its first write). `role import` and
 * `app import` do not run on a classic deployment, which is what that login
 * is, so only the failed login (a closed port) is driven for those two. No
 * tenant, no secrets, no terminal; a temporary HOME keeps it away from real
 * profiles.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

/** The commands the fake can log in for: the file they import and the summary they print. */
const NETWORK_CASES = [
  {
    name: 'realm import',
    key: 'realm',
    args: ['realm', 'import', '-a', '-f', 'two.realm.json'],
    file: 'two.realm.json',
    content: {
      realm: {
        r1: { _id: 'r1', name: 'one' },
        r2: { _id: 'r2', name: 'two' },
      },
    },
    summary: /2 of 2 realms failed:\n\s+- r1: .*\n\s+- r2: /,
  },
  {
    name: 'saml import',
    key: 'saml',
    args: ['saml', 'import', '-a', '-f', 'two.saml.json'],
    file: 'two.saml.json',
    content: {
      saml: {
        hosted: { aG9zdGVkMQ: { entityId: 'hosted1' } },
        remote: {},
        metadata: {},
        cot: {},
      },
      script: {},
    },
    summary: /1 of 1 SAML provider failed:\n\s+- /,
  },
  {
    name: 'saml cot import',
    key: 'cot',
    args: ['saml', 'cot', 'import', '-a', '-f', 'two.cot.saml.json'],
    file: 'two.cot.saml.json',
    content: { saml: { cot: { c1: { _id: 'c1' }, c2: { _id: 'c2' } } } },
    summary: /\d of 2 trust circles? failed:\n\s+- /,
  },
  {
    name: 'idp import',
    key: 'idp',
    args: ['idp', 'import', '-a', '-f', 'two.idp.json'],
    file: 'two.idp.json',
    content: {
      idp: {
        i1: { _id: 'i1', _type: { _id: 'x' } },
        i2: { _id: 'i2', _type: { _id: 'x' } },
      },
    },
    summary: /2 of 2 identity providers failed:\n\s+- .*i1.*\n\s+- .*i2/,
  },
  {
    name: 'oauth client import',
    key: 'oauth',
    args: ['oauth', 'client', 'import', '-a', '-f', 'two.oauth2.app.json'],
    file: 'two.oauth2.app.json',
    content: { application: { o1: { _id: 'o1' }, o2: { _id: 'o2' } } },
    summary: /2 of 2 clients failed:\n\s+- .*o1.*\n\s+- .*o2/,
  },
];

/** Every command of the family, for the failed login. */
const ALL_COMMANDS = [
  ...NETWORK_CASES.map((c) => ({ name: c.name, args: c.args })),
  {
    name: 'role import',
    args: ['role', 'import', '-a', '-f', 'two.internalrole.json'],
  },
  {
    name: 'app import',
    args: ['app', 'import', '-a', '-f', 'two.application.json'],
  },
];

suite('the imports of realms, roles and providers, through the CLI', () => {
  let home;
  let work;
  let fakeAm;

  beforeAll(async () => {
    ensureFrodoArtifact();
    fakeAm = await startFakeAm({ journey: 'password' });
  });

  afterAll(() => {
    fakeAm.stop();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-import-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-import-work-'));
    for (const c of NETWORK_CASES) {
      fs.writeFileSync(path.join(work, c.file), JSON.stringify(c.content));
      // -A imports every file of a directory: one folder per command, so that
      // the files of the other commands are not picked up
      fs.mkdirSync(path.join(work, c.key));
      fs.writeFileSync(
        path.join(work, c.key, c.file),
        JSON.stringify(c.content)
      );
    }
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Runs `frodo <args>` in the working directory and answers its exit code and output. */
  function run(args) {
    return new Promise((resolve, reject) => {
      const child = cp.spawn(binaryPath, args, {
        cwd: work,
        env: {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_TEST: '',
          FRODO_NO_CACHE: 'true',
          NODE_OPTIONS: '',
          NO_COLOR: '1',
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

  const onFake = (args, type = 'classic') => [
    ...args,
    `http://127.0.0.1:${fakeAm.port}/am`,
    'root',
    'someone',
    'secret',
    '-m',
    type,
  ];

  describe.each(NETWORK_CASES)('$name -a', (c) => {
    it(
      'names every item that failed in one summary and exits 1',
      async () => {
        const { code, output } = await run(onFake(c.args));

        expect(output).toMatch(c.summary);
        expect(output).not.toContain('--allow-failures was given');
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      'with --allow-failures still prints the summary and exits 0',
      async () => {
        const { code, output } = await run(
          onFake([...c.args, '--allow-failures'])
        );

        expect(output).toMatch(c.summary);
        expect(output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
        expect(code).toBe(0);
      },
      TIMEOUT
    );
  });

  describe.each(NETWORK_CASES)('$name -A', (c) => {
    // the same command with -A and -D <folder> in place of -a and -f <file>
    const separate = [
      ...c.args.slice(0, c.args.indexOf('-a')),
      '-A',
      '-D',
      c.key,
    ];

    it(
      'names every item that failed in one summary and exits 1',
      async () => {
        const { code, output } = await run(onFake(separate));

        expect(output).toMatch(c.summary);
        expect(output).not.toContain('--allow-failures was given');
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      'with --allow-failures still prints the summary and exits 0',
      async () => {
        const { code, output } = await run(
          onFake([...separate, '--allow-failures'])
        );

        expect(output).toMatch(c.summary);
        expect(output).toContain(
          'The exit code stays 0 because --allow-failures was given.'
        );
        expect(code).toBe(0);
      },
      TIMEOUT
    );
  });

  it(
    'a file that was named and does not exist fails whatever --allow-failures says',
    async () => {
      const { code, output } = await run(
        onFake([
          'realm',
          'import',
          '-a',
          '-f',
          'missing.realm.json',
          '--allow-failures',
        ])
      );

      expect(output).toContain('missing.realm.json');
      expect(output).not.toContain('--allow-failures was given');
      expect(code).toBe(1);
    },
    TIMEOUT
  );

  describe.each(ALL_COMMANDS)('$name', (c) => {
    it(
      'a failed login exits 1 with the login error, not as an unrecognized combination of options',
      async () => {
        // nothing listens on port 1
        const { code, output } = await run([
          ...c.args,
          'http://127.0.0.1:1/am',
          'root',
          'someone',
          'secret',
          '-m',
          'forgeops',
        ]);

        expect(output).toMatch(/ECONNREFUSED|Error getting tokens/);
        expect(output).not.toContain('Unrecognized combination');
        expect(code).toBe(1);
      },
      TIMEOUT
    );
  });

  it(
    'options that do not say what to import are refused before any login',
    async () => {
      // an id without a file: nothing listens on port 1, and no login is tried
      const { code, output } = await run([
        'realm',
        'import',
        '-i',
        'x',
        'http://127.0.0.1:1/am',
        'root',
        'someone',
        'secret',
        '-m',
        'classic',
      ]);

      expect(output).toContain('Unrecognized combination');
      expect(output).not.toContain('ECONNREFUSED');
      expect(code).toBe(1);
    },
    TIMEOUT
  );
});
