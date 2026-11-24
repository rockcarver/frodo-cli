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
 * Every run: NODE_OPTIONS removed (the test scripts set `--no-warnings`, which
 * would hide exactly what is measured), no `FRODO_MOCK*` variable, a temporary
 * HOME and profile file, the fake tenant of test/utils/FakeAm.mjs for the request.
 * No tenant, no secrets, no terminal.
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
    // eslint-disable-next-line no-unused-vars
    const { NODE_OPTIONS, FRODO_SOURCE_MAPS, ...rest } = process.env;
    const clean = Object.fromEntries(
      Object.entries(rest).filter(([name]) => !name.startsWith('FRODO_MOCK'))
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
      const recordPath = path.join(home, 'requests.jsonl');
      fakeAm = await startFakeAm({
        recordPath,
        journey: 'password',
        realms: ['alpha'],
        trees: ['Login'],
      });
      const result = frodo([
        'journey',
        'list',
        `http://127.0.0.1:${fakeAm.port}/am`,
        'alpha',
        'someone',
        'secret',
        '-m',
        'classic',
      ]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Login');
      // it did ask: the request that would print DEP0169 without `noDeprecation`
      expect(readRequests(recordPath).length).toBeGreaterThan(0);
      expect(result.stderr).toBe('');
    },
    TIMEOUT
  );

  test(
    'a warning from anything in the process reaches stderr: the entry does not hide it',
    () => {
      const preload = path.join(home, 'warn.cjs');
      fs.writeFileSync(
        preload,
        "process.emitWarning('a warning from a preload');"
      );
      const result = frodo(['-v'], { NODE_OPTIONS: `--require=${preload}` });
      expect(result.status).toBe(0);
      expect(result.stderr).toMatch(
        /\(node:\d+\) Warning: a warning from a preload/
      );
    },
    TIMEOUT
  );

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
