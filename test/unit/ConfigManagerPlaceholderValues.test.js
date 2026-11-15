import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { PLACEHOLDER_VALUES_RULE } from '../../src/utils/PlaceholderValues.ts';
import {
  fullName,
  loadCommandTree,
  renderFullHelp,
} from '../utils/CommandExamples.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * Where the value of a `${NAME}` placeholder comes from when the config-manager
 * commands push a file (finding 5 of the live check of cli#1260). The help of
 * `pull oauth-issuers` and `pull oauth-cimd-profiles` said "Push fills each
 * ${NAME} from the environment variable NAME", which reads like the environment
 * of the process, but the library fills a placeholder only from the values that
 * `-E/--env` and `--env-file` put into its state: a push with the variable only
 * in the environment fails with `No value found for placeholder`.
 *
 * Reading the environment of the process as a last source is NOT done here, on
 * purpose: the library uses the same state in the opposite direction when it
 * exports (`substituteEntityWithEnv` replaces every value of the state with
 * `${KEY}` in the exported text), so putting the whole process environment into
 * the state changes exports (`idm export`, `esv secret list -u`, ...). The fix
 * belongs in the library's placeholder reader. Until then the help says what the
 * commands do, and this test keeps the help and the behaviour in agreement: if a
 * later change reads the environment, the test of the process environment below
 * fails and the help rule has to be updated with it.
 *
 * Two levels: the four help texts, and the real CLI against a fake tenant
 * (test/utils/FakeAm.mjs) whose request log shows which source filled the
 * placeholder of a pushed issuer. No tenant, no secrets, no master key; a
 * temporary HOME and working directory keep it away from real files.
 */

const NAME = 'ZION_PLACEHOLDER_URL';
const FROM_ENV = 'https://from-env.example.com';
const FROM_FILE = 'https://from-file.example.com';
const FROM_FLAG = 'https://from-flag.example.com';

describe('the help says where the values come from', () => {
  // eslint-disable-next-line no-control-regex -- strips colour codes from rendered help
  const ANSI = /\x1b\[[0-9;]*m/g;
  const FOUR = [
    'frodo config-manager pull oauth-issuers',
    'frodo config-manager push oauth-issuers',
    'frodo config-manager pull oauth-cimd-profiles',
    'frodo config-manager push oauth-cimd-profiles',
  ];
  const originalArgv = process.argv;
  const helps = new Map();

  beforeAll(async () => {
    // the examples (and so the end of the help) are rendered only for -hhh
    process.argv = [...originalArgv, '--help-all'];
    try {
      const { leaves } = await loadCommandTree();
      for (const leaf of leaves) {
        if (FOUR.includes(fullName(leaf))) {
          // the help wraps lines: compare the words
          helps.set(
            fullName(leaf),
            renderFullHelp(leaf).replace(ANSI, '').replace(/\s+/g, ' ')
          );
        }
      }
    } finally {
      process.argv = originalArgv;
    }
  });

  it('finds the four commands', () => {
    expect([...helps.keys()].sort()).toEqual([...FOUR].sort());
  });

  it.each(FOUR)('%s says it with one shared rule', (name) => {
    const help = helps.get(name);
    expect(help).toContain(PLACEHOLDER_VALUES_RULE);
    // the wording that read like the process environment is gone
    expect(help).not.toContain('Push fills each ${NAME} from the environment');
    expect(help).not.toContain(
      'replaced by the value of the environment variable NAME'
    );
  });

  it('the rule names the two sources, -E first, and says the process environment is not read', () => {
    const rule = PLACEHOLDER_VALUES_RULE;
    expect(rule.indexOf('-E/--env')).toBeGreaterThan(-1);
    expect(rule.indexOf('--env-file')).toBeGreaterThan(
      rule.indexOf('-E/--env')
    );
    expect(rule).toContain('environment variables of the process are not read');
  });
});

const suite = process.platform === 'win32' ? describe.skip : describe;

suite('push and pull oauth-issuers against a fake tenant', () => {
  const TIMEOUT = 120000;
  let home;
  let work;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-placeholder-home-'));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-placeholder-work-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** Starts the fake and returns a function that runs the CLI once against it, with `extraEnv` in its environment. */
  async function tenant(options) {
    fakeAm = await startFakeAm({
      journey: 'password',
      recordPath: record,
      ...options,
    });
    return (args, extraEnv = {}) =>
      new Promise((resolve, reject) => {
        const env = {
          ...process.env,
          HOME: home,
          USERPROFILE: home,
          FRODO_HOST: `http://127.0.0.1:${fakeAm.port}/am`,
          FRODO_USERNAME: 'someone@example.com',
          FRODO_PASSWORD: 'secret',
          FRODO_TEST: '',
          FRODO_NO_CACHE: 'true',
          NODE_OPTIONS: '',
          NO_COLOR: '1',
        };
        // the runner's own environment must not hold the placeholder
        delete env[NAME];
        Object.assign(env, extraEnv);
        const child = cp.spawn(binaryPath, args, {
          cwd: work,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (chunk) => (output += chunk));
        child.stderr.on('data', (chunk) => (output += chunk));
        child.once('error', reject);
        child.once('close', (code) => resolve({ code, output }));
      });
  }

  const requests = () =>
    fs.existsSync(record)
      ? fs
          .readFileSync(record, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
      : [];
  const puts = () => requests().filter((r) => r.method === 'PUT');
  const target = () => [`http://127.0.0.1:${fakeAm.port}/am`, 'alpha'];
  const issuersOf = (realm) =>
    path.join(
      work,
      'realms',
      realm,
      'realm-config',
      'agents',
      'TrustedJwtIssuer'
    );
  const writeIssuer = (id, value) => {
    fs.mkdirSync(issuersOf('alpha'), { recursive: true });
    fs.writeFileSync(
      path.join(issuersOf('alpha'), `${id}.json`),
      JSON.stringify({
        _id: id,
        _type: {
          _id: 'TrustedJwtIssuer',
          name: 'OAuth2 Trusted JWT Issuer',
          collection: true,
        },
        issuer: { inherited: false, value },
      })
    );
  };
  const pushedValues = () =>
    new Set(puts().map((r) => JSON.parse(r.body).issuer?.value));
  const push = (run, extra = [], env = {}) =>
    run(
      ['config-manager', 'push', 'oauth-issuers', ...extra, ...target()],
      env
    );

  describe('push', () => {
    it(
      'fills a placeholder from -E',
      async () => {
        const run = await tenant({ oauthIssuers: [] });
        writeIssuer('zion-new', `\${${NAME}}`);

        const { code, output } = await push(run, [
          '-E',
          `${NAME}=${FROM_FLAG}`,
        ]);

        expect(output).not.toMatch(/No value found|Error|failed/);
        expect(code).toBe(0);
        expect(pushedValues()).toEqual(new Set([FROM_FLAG]));
      },
      TIMEOUT
    );

    it(
      'fills a placeholder from --env-file, and -E wins over it',
      async () => {
        const run = await tenant({ oauthIssuers: [] });
        writeIssuer('zion-new', `\${${NAME}}`);
        fs.writeFileSync(
          path.join(work, 'values.env'),
          `${NAME}=${FROM_FILE}\n`
        );

        const fromFile = await push(run, ['--env-file', 'values.env']);
        expect(fromFile.code).toBe(0);
        expect(pushedValues()).toEqual(new Set([FROM_FILE]));

        fs.rmSync(record, { force: true });
        const both = await push(run, [
          '--env-file',
          'values.env',
          '-E',
          `${NAME}=${FROM_FLAG}`,
        ]);
        expect(both.code).toBe(0);
        expect(pushedValues()).toEqual(new Set([FROM_FLAG]));
      },
      TIMEOUT
    );

    it(
      'does not read the environment variables of the process, as the help says: the push fails, names the placeholder and writes nothing',
      async () => {
        const run = await tenant({ oauthIssuers: [] });
        writeIssuer('zion-new', `\${${NAME}}`);

        // the variable is in the environment of the process, and nowhere else
        const { code, output } = await push(run, [], { [NAME]: FROM_ENV });

        expect(code).toBe(1);
        expect(output).toContain(`No value found for placeholder "${NAME}"`);
        expect(puts()).toEqual([]);
        expect(JSON.stringify(requests())).not.toContain(FROM_ENV);
      },
      TIMEOUT
    );

    it(
      'fails for a placeholder that has no value anywhere, names it and writes nothing',
      async () => {
        const run = await tenant({ oauthIssuers: [] });
        writeIssuer('zion-new', `\${${NAME}}`);

        const { code, output } = await push(run);

        expect(code).toBe(1);
        expect(output).toContain(`No value found for placeholder "${NAME}"`);
        expect(puts()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('pull', () => {
    it(
      'writes the placeholder of the overrides file, not a value, also when the variable is in the environment',
      async () => {
        const run = await tenant({ oauthIssuers: ['zion-old'] });
        fs.writeFileSync(
          path.join(work, 'overrides.json'),
          JSON.stringify({
            alpha: [
              {
                id: 'zion-old',
                overrides: { issuer: { value: `\${${NAME}}` } },
              },
            ],
          })
        );

        const { code, output } = await run(
          [
            'config-manager',
            'pull',
            'oauth-issuers',
            '--config-file',
            'overrides.json',
            ...target(),
          ],
          { [NAME]: FROM_ENV }
        );

        expect(output).not.toMatch(/No value found|Error|failed/);
        expect(code).toBe(0);
        const text = fs.readFileSync(
          path.join(issuersOf('alpha'), 'zion-old.json'),
          'utf8'
        );
        expect(JSON.parse(text).issuer.value).toBe(`\${${NAME}}`);
        expect(text).not.toContain(FROM_ENV);
      },
      TIMEOUT
    );
  });
});
