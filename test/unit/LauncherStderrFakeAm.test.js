import cp from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * What the REAL CLI of this checkout writes to stderr when it starts and when it
 * makes a request, with no Node flag at all: nothing but its own messages.
 *
 * The entry (`dist/launch.cjs`, see LauncherCommandLine.test.js) used to remove
 * every process warning listener, because frodo-lib loaded its test recorder at
 * start-up and that load printed Node 26's `localStorage` ExperimentalWarning on
 * every command. Since frodo-lib 5.0.0-51 the recorder is loaded only when
 * `FRODO_MOCK` is set, the entry leaves warnings to Node, and these tests are
 * what keeps a clean start clean: a library that loads the recorder again, or a
 * dependency that prints a deprecation at start-up, shows here as a line on
 * stderr. The one deprecation that a request does print (DEP0169, `url.parse()`
 * in the proxy agent of the library) is silenced by `process.noDeprecation` in
 * `src/app.ts`; the request case below fails without it.
 *
 * The native binary is not started through the entry. Its `--no-warnings` is an
 * argument that `sea-config.json` bakes into it, and the last case pins that.
 *
 * Every run: `NODE_OPTIONS`, `NODE_NO_WARNINGS` and `NODE_PENDING_DEPRECATION`
 * removed (the test scripts set `--no-warnings`, and a shell or a CI job often
 * sets `NODE_NO_WARNINGS`: either would hide exactly what is measured), no
 * `FRODO_MOCK*` variable unless a case sets it, a temporary HOME and profile
 * file, the fake tenant of test/utils/FakeAm.mjs for the requests. No tenant, no
 * secrets, no terminal.
 *
 * Skipped on Windows: the CLI is started through its launcher script.
 */
const suite = process.platform === 'win32' ? describe.skip : describe;

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');
const TIMEOUT = 120000;
const HOST = 'https://openam-matrix.example.com/am';

/**
 * The variables of the runner that change what a start prints. `NODE_OPTIONS`
 * carries `--no-warnings` in the test scripts, `NODE_NO_WARNINGS` is the other
 * way to say the same, `NODE_PENDING_DEPRECATION` adds deprecations. (Node has
 * no `NODE_NO_DEPRECATION`.) `FRODO_SOURCE_MAPS` changes stack traces only; it
 * goes too, so that a failure prints the same everywhere.
 */
const DECIDED_BY_THE_CASE = [
  'NODE_OPTIONS',
  'NODE_NO_WARNINGS',
  'NODE_PENDING_DEPRECATION',
  'FRODO_SOURCE_MAPS',
];

/**
 * A preload (`NODE_OPTIONS=--require`) that raises a plain warning and an
 * ExperimentalWarning (the kind of the `localStorage` line) at start-up, again
 * once the event loop runs, and again 100 ms later: a regression that hides
 * only one kind, or only what comes after start-up, leaves one of them out.
 */
const WARNING_PRELOAD = `
const raise = (when) => {
  process.emitWarning('plain warning ' + when);
  process.emitWarning('experimental warning ' + when, 'ExperimentalWarning');
};
raise('at start');
setTimeout(() => {
  raise('after start');
  setTimeout(() => raise('later'), 100).unref();
}, 50).unref();
`;

/** What Node prints for the two warnings raised by WARNING_PRELOAD at one moment. */
const warningsRaisedAt = (when) => [
  new RegExp(`\\(node:\\d+\\) Warning: plain warning ${when}`),
  new RegExp(
    `\\(node:\\d+\\) ExperimentalWarning: experimental warning ${when}`
  ),
];

suite('the CLI prints no process warning of its own', () => {
  let home;
  let profilesPath;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-launcher-stderr-'));
    profilesPath = path.join(home, 'Connections.json');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
  });

  /** Runs the built CLI to its end, without a terminal, the way a user's shell does. */
  function frodo(args, env = {}) {
    const clean = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) =>
          !DECIDED_BY_THE_CASE.includes(name) && !name.startsWith('FRODO_MOCK')
      )
    );
    return cp.spawnSync(process.execPath, [launch, ...args], {
      cwd: home,
      input: '',
      encoding: 'utf8',
      env: {
        ...clean,
        HOME: home,
        USERPROFILE: home,
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
        FRODO_NO_CACHE: 'true',
        FRODO_NO_PROMPT: '1',
        FRODO_NO_UPDATE_CHECK: '1',
        NO_COLOR: '1',
        FRODO_HOST: '',
        FRODO_REALM: '',
        FRODO_USERNAME: '',
        FRODO_PASSWORD: '',
        FRODO_SA_ID: '',
        FRODO_SA_JWK: '',
        FRODO_CREDENTIAL: '',
        ...env,
      },
    });
  }

  /** Starts the fake tenant (a plain login, realm alpha, one journey) and returns the arguments of `command` against it. */
  async function tenantArgs(command, options = {}) {
    fakeAm = await startFakeAm({
      recordPath: path.join(home, 'requests.jsonl'),
      journey: 'password',
      realms: ['alpha'],
      trees: ['Login'],
      ...options,
    });
    return [
      ...command,
      `http://127.0.0.1:${fakeAm.port}/am`,
      'alpha',
      'someone',
      'secret',
      '-m',
      'classic',
    ];
  }

  test.each([['-v'], ['-h']])(
    'frodo %s writes nothing to stderr',
    (flag) => {
      const result = frodo([flag]);
      expect(result.status).toBe(0);
      expect(result.stdout).not.toBe('');
      expect(result.stderr).toBe('');
    },
    TIMEOUT
  );

  // `conn list` ends with a hint (or a note that there is nothing to list) on
  // stderr: its own message, which is the same with and without a warning.
  // What must not be there is the line that Node prints for a process warning.
  const nodeWarnings = (stderr) =>
    stderr.split('\n').filter((line) => /^\(node:\d+\) /.test(line));

  test(
    'frodo conn list with a profile prints its hint and no process warning',
    () => {
      fs.writeFileSync(
        profilesPath,
        JSON.stringify({
          [HOST]: {
            tenant: HOST,
            alias: 'matrix',
            deploymentType: 'cloud',
            username: 'someone',
          },
        })
      );
      const result = frodo(['conn', 'list']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('matrix');
      expect(result.stderr).toMatch(/^Any unique substring or alias/);
      expect(nodeWarnings(result.stderr)).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'frodo conn list with no profile prints its note and no process warning',
    () => {
      const result = frodo(['conn', 'list']);
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(/^No connection profiles in [^\n]+\n$/);
      expect(nodeWarnings(result.stderr)).toEqual([]);
    },
    TIMEOUT
  );

  test(
    'a command that asks the tenant writes nothing to stderr',
    async () => {
      const args = await tenantArgs(['journey', 'list']);
      const result = frodo(args);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Login');
      // it did ask: the request that would print DEP0169 without `noDeprecation`
      expect(
        readRequests(path.join(home, 'requests.jsonl')).length
      ).toBeGreaterThan(0);
      expect(result.stderr).toBe('');
    },
    TIMEOUT
  );

  test(
    'a command that fails prints its own error and no process warning',
    async () => {
      const args = await tenantArgs([
        'journey',
        'describe',
        '-i',
        'NoSuchJourney',
      ]);
      const result = frodo(args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('NoSuchJourney');
      expect(nodeWarnings(result.stderr)).toEqual([]);
    },
    TIMEOUT
  );

  describe('a warning from anything in the process reaches stderr: the entry does not hide it', () => {
    let preload;

    beforeEach(() => {
      preload = path.join(home, 'warn.cjs');
      fs.writeFileSync(preload, WARNING_PRELOAD);
    });

    test.each([
      ['with no switch', {}],
      ['when FRODO_MOCK is set, which loads the recorder', { FRODO_MOCK: '1' }],
    ])(
      'both kinds, at start-up, %s',
      (_, env) => {
        const result = frodo(['-v'], {
          NODE_OPTIONS: `--require=${preload}`,
          ...env,
        });
        expect(result.status).toBe(0);
        for (const line of warningsRaisedAt('at start')) {
          expect(result.stderr).toMatch(line);
        }
      },
      TIMEOUT
    );

    test(
      'both kinds, also after the command has started and while it waits for the tenant',
      async () => {
        // the login answers after 600 ms, so the command is still running when
        // the second and the third round of warnings are raised
        const args = await tenantArgs(['journey', 'list'], {
          loginDelayMs: 600,
        });
        const result = frodo(args, { NODE_OPTIONS: `--require=${preload}` });
        expect(result.status).toBe(0);
        for (const when of ['at start', 'after start', 'later']) {
          for (const line of warningsRaisedAt(when)) {
            expect(result.stderr).toMatch(line);
          }
        }
      },
      TIMEOUT
    );
  });

  test('the native binary keeps its --no-warnings argument', () => {
    // It starts app.cjs itself, without the entry, so this argument is the
    // only thing that keeps `FRODO_MOCK` runs of the binary free of Node 26's
    // localStorage warning.
    const config = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'sea-config.json'), 'utf8')
    );
    expect(config.execArgv).toContain('--no-warnings');
  });
});
