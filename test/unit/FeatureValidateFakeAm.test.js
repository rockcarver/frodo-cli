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
 * `frodo feature validate` (#1300) driven through the REAL CLI of this checkout
 * against the fake AM of test/utils/FakeAm.mjs in a separate process, with no
 * tenant and no recording: the feature registry and the IDM configuration the
 * fake serves are read-only, and the request log shows that nothing was ever
 * written.
 *
 * What it proves that the unit tests of the operations cannot: the options
 * of the command line (the combinations that are refused before the login,
 * `--json` against `--repair`), the exit code of the process, what reaches
 * stdout and stderr, that a feature the library cannot diagnose sends the
 * request it always sent and no more, and that a repair that cannot run
 * writes nothing to the tenant and nothing to the disk.
 *
 * The repair that DOES write is covered by the unit tests of the operations
 * with the library stubbed: a fake tenant would need the shipped definitions
 * of the feature to be repairable, and those are inside frodo-lib.
 *
 * Skipped on Windows: the CLI binary shim is a shell script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const TIMEOUT = 120000;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const ALREADY_PRESENT = {
  status: 200,
  success: false,
  message: 'Validate complete. 1 failure(s).',
  failures: [
    'config/managed: /objects/-: value already present at /objects/14',
  ],
};

/** The writes a request log can hold: anything that is not a read, and the actions that change the tenant. */
const writesOf = (requests) =>
  requests.filter(({ method, url }) => {
    if (['PUT', 'PATCH', 'DELETE'].includes(method)) return true;
    return (
      method === 'POST' &&
      /_action=(enable|install|create|update|delete)/.test(url) &&
      !url.includes('/authenticate')
    );
  });

suite('feature validate through the CLI', () => {
  let home;
  let work;
  let logDir;
  let recordPath;
  const fakes = [];

  beforeAll(() => {
    ensureFrodoArtifact();
    // the fakes outlive a test, so the log they append to does too
    logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-feature-log-'));
    recordPath = path.join(logDir, 'requests.jsonl');
  });

  afterAll(() => {
    for (const fake of fakes) fake.stop();
    fs.rmSync(logDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-feature-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-feature-work-'));
    fs.rmSync(recordPath, { force: true });
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts a fake AM that is stopped when the suite ends. */
  async function fake(options) {
    const started = await startFakeAm({
      journey: 'service-account',
      recordPath,
      ...options,
    });
    fakes.push(started);
    return started;
  }

  /** Runs `frodo <args>` in the working directory, without a terminal, and answers its exit code and both outputs. */
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
          FRODO_HOST: '',
          FRODO_REALM: '',
          FRODO_USERNAME: '',
          FRODO_PASSWORD: '',
          FRODO_CREDENTIAL: '',
          FRODO_SA_ID: 'test-account',
          FRODO_SA_JWK: serviceAccountJwk,
          NODE_OPTIONS: '',
          NO_COLOR: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  const validate = (server, args) =>
    run([
      'feature',
      'validate',
      ...args,
      `http://127.0.0.1:${server.port}/am`,
      '--type',
      'cloud',
    ]);

  describe('what is refused before the login, whatever the tenant', () => {
    let server;
    beforeAll(async () => {
      server = await fake({ features: [] });
    });

    const refused = [
      [
        ['-i', 'aiagent', '--repair'],
        /Refusing to repair the feature "aiagent" without confirmation: there is no interactive terminal to ask\. Pass -y\/--yes/,
      ],
      [
        ['-i', 'aiagent', '--repair', '-y'],
        /--backup-dir is required and there is no interactive terminal to ask for it/,
      ],
      [['-i', 'aiagent', '--wait'], /--wait requires --repair\./],
      [['-i', 'aiagent', '--yes'], /--yes requires --repair\./],
      [
        ['-i', 'aiagent', '--keep-aligned'],
        /--keep-aligned requires --repair\./,
      ],
      [
        ['-i', 'aiagent', '--auth-service', 'Zion'],
        /--auth-service requires --repair\./,
      ],
      [
        ['-i', 'aiagent', '--backup-dir', 'b'],
        /--backup-dir requires --repair\./,
      ],
      [
        [
          '-i',
          'aiagent',
          '--repair',
          '-y',
          '--backup-dir',
          'b',
          '--timeout',
          '5',
        ],
        /--timeout requires --wait\./,
      ],
      [
        ['-i', 'aiagent', '--json', '--repair', '-y', '--backup-dir', 'b'],
        /option '--json' cannot be used with option '--repair'/,
      ],
    ];

    it.each(refused)(
      '%j fails with exit 1, says why, and never logs in',
      async (args, message) => {
        fs.rmSync(recordPath, { force: true });

        const { code, stdout, stderr } = await validate(server, args);

        expect(stderr).toMatch(message);
        expect(stdout).toBe('');
        expect(code).toBe(1);
        expect(readRequests(recordPath)).toEqual([]);
        expect(fs.existsSync(path.join(work, 'b'))).toBe(false);
      },
      TIMEOUT
    );

    it(
      '--timeout that is not a number of seconds is refused while the command line is read',
      async () => {
        const { code, stderr } = await validate(server, [
          '-i',
          'aiagent',
          '--repair',
          '--wait',
          '--timeout',
          'soon',
        ]);

        expect(stderr).toContain('It must be a number of seconds, 0 or more.');
        expect(code).toBe(1);
        expect(readRequests(recordPath)).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('a feature the library cannot diagnose', () => {
    let server;
    beforeAll(async () => {
      server = await fake({
        features: [
          {
            _id: 'groups',
            installedVersion: '1',
            availableVersions: ['1'],
            validate: ALREADY_PRESENT,
          },
        ],
      });
    });

    it(
      'prints what it always printed, exits 0, and sends the one request it always sent: the validation',
      async () => {
        fs.rmSync(recordPath, { force: true });

        const { code, stdout, stderr } = await validate(server, [
          '-i',
          'groups',
        ]);

        expect(stdout).toContain('Invalid: Validate complete. 1 failure(s).');
        expect(stdout).toContain('  - config/managed: /objects/-');
        expect(stdout).not.toContain('Diagnosis');
        expect(stderr).toContain('the configuration is already in the tenant');
        expect(code).toBe(0);
        const featureRequests = readRequests(recordPath).filter(({ url }) =>
          url.includes('/openidm/feature')
        );
        expect(
          featureRequests.map(({ method, url }) => `${method} ${url}`)
        ).toEqual(['POST /openidm/feature/groups?_action=validate']);
      },
      TIMEOUT
    );

    it(
      '--json asks the library, which says it does not judge the feature, and exits 0',
      async () => {
        const { code, stdout } = await validate(server, [
          '-i',
          'groups',
          '--json',
        ]);

        expect(JSON.parse(stdout)).toEqual({
          featureId: 'groups',
          supported: false,
          installedVersion: '1',
          availableVersions: ['1'],
          findings: [],
        });
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      '--repair says no repair is known, exits 1, and writes nothing, not to the tenant and not to the disk',
      async () => {
        fs.rmSync(recordPath, { force: true });

        const { code, stdout, stderr } = await validate(server, [
          '-i',
          'groups',
          '--repair',
          '-y',
          '--backup-dir',
          'b',
        ]);

        expect(stderr).toContain('No repair is known for feature "groups".');
        expect(stdout).toBe('');
        expect(code).toBe(1);
        expect(writesOf(readRequests(recordPath))).toEqual([]);
        expect(fs.existsSync(path.join(work, 'b'))).toBe(false);
      },
      TIMEOUT
    );
  });

  describe('aiagent on a tenant that never had it', () => {
    let server;
    beforeAll(async () => {
      server = await fake({
        features: [
          { _id: 'aiagent', installedVersion: null, availableVersions: ['1'] },
        ],
        idmConfig: {
          managed: { _id: 'managed', objects: [] },
          'repo.ds': {
            _id: 'repo.ds',
            resourceMapping: { explicitMapping: {} },
          },
        },
      });
    });

    it(
      'prints the diagnosis after the validation, and a warning is not a functional problem: exit 0',
      async () => {
        const { code, stdout } = await validate(server, ['-i', 'aiagent']);

        expect(stdout).toContain('Valid: Validate complete.');
        expect(stdout).toContain('Diagnosis of feature "aiagent":');
        expect(stdout).toContain(
          '⚠ Registry     The registry reports no installed version.'
        );
        expect(stdout).toContain(
          'The tenant has none of the definitions of the feature'
        );
        expect(stdout).toContain('No functional problem, 1 warning.');
        expect(stdout).not.toContain('--repair');
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      '--json prints the diagnosis of the library and nothing else',
      async () => {
        const { code, stdout } = await validate(server, [
          '-i',
          'aiagent',
          '--json',
        ]);

        const diagnosis = JSON.parse(stdout);
        expect(diagnosis).toMatchObject({
          featureId: 'aiagent',
          supported: true,
          installedVersion: null,
        });
        expect(diagnosis.findings.map(({ id }) => id)).toEqual([
          'registry-not-installed',
          'feature-not-installed',
        ]);
        expect(code).toBe(0);
      },
      TIMEOUT
    );

    it(
      '--repair finds nothing to repair, exits 0, and writes no backup',
      async () => {
        fs.rmSync(recordPath, { force: true });

        const { code, stderr } = await validate(server, [
          '-i',
          'aiagent',
          '--repair',
          '-y',
          '--backup-dir',
          'b',
        ]);

        expect(stderr).toContain('Nothing to repair for feature "aiagent".');
        expect(code).toBe(0);
        expect(writesOf(readRequests(recordPath))).toEqual([]);
        expect(fs.existsSync(path.join(work, 'b'))).toBe(false);
      },
      TIMEOUT
    );
  });

  describe('aiagent on a tenant whose definitions the library cannot repair', () => {
    let server;
    beforeAll(async () => {
      server = await fake({
        features: [
          { _id: 'aiagent', installedVersion: null, availableVersions: ['1'] },
        ],
        // one object of the feature and nothing else of it: most definitions are missing
        idmConfig: {
          managed: {
            _id: 'managed',
            objects: [{ name: 'alpha_aiagent', schema: { type: 'object' } }],
          },
          'repo.ds': {
            _id: 'repo.ds',
            resourceMapping: { explicitMapping: {} },
          },
        },
      });
    });

    it(
      'a functional problem is shown with its mark and the hint, and the exit code is 1: a health check for a pipeline',
      async () => {
        const { code, stdout } = await validate(server, ['-i', 'aiagent']);

        expect(stdout).toContain('✖ Definitions');
        expect(stdout).toContain('alpha_aiagent  schema.properties  missing');
        expect(stdout).toContain(
          '✖ Provider     The realm alpha has no OAuth 2.0 provider'
        );
        expect(stdout).toMatch(
          /\d+ functional problems?, \d+ warnings?; 1 repairable\./
        );
        expect(stdout).toContain(
          'Run "frodo feature validate -i aiagent --repair" to fix the repairable ones. A backup is written first.'
        );
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      '--json exits 1 for the same reason, and the findings carry their severity',
      async () => {
        const { code, stdout } = await validate(server, [
          '-i',
          'aiagent',
          '--json',
        ]);

        const severities = JSON.parse(stdout).findings.map(
          ({ severity }) => severity
        );
        expect(severities).toContain('error');
        expect(code).toBe(1);
      },
      TIMEOUT
    );

    it(
      '--repair says what blocks it, exits 1, and writes nothing to the tenant and no backup to the disk',
      async () => {
        fs.rmSync(recordPath, { force: true });

        const { code, stdout, stderr } = await validate(server, [
          '-i',
          'aiagent',
          '--repair',
          '-y',
          '--backup-dir',
          'b',
        ]);

        expect(stderr).toContain('The feature "aiagent" cannot be repaired:');
        expect(stderr).toContain('Nothing was changed.');
        expect(stdout).toContain('Diagnosis of feature "aiagent":');
        // the repair's own diagnosis does not offer the repair it just refused
        expect(stdout).not.toContain('Run "frodo feature validate');
        expect(code).toBe(1);
        const requests = readRequests(recordPath);
        // it did log in and read the tenant, so the empty list of writes means something
        expect(
          requests.some(({ url }) => url.includes('/openidm/feature'))
        ).toBe(true);
        expect(writesOf(requests)).toEqual([]);
        expect(fs.existsSync(path.join(work, 'b'))).toBe(false);
      },
      TIMEOUT
    );
  });
});
