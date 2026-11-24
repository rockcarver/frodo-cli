import cp from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { readRequests } from '../utils/FakeAmLog.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

const require = createRequire(import.meta.url);
const {
  binaryPath,
  ensureFrodoArtifact,
} = require('../e2e/utils/FrodoBinary.cjs');

/**
 * `journey validate` over many journeys, the REAL CLI of this checkout on export files (no login, no
 * tenant): what a script sees when stdout and stderr are pipes, and what a person sees at a terminal.
 *
 * - Without a terminal there is no progress bar: the output of a pipeline or a file holds the
 *   findings, the summary by code and the hints, nothing else, and stdout stays empty.
 * - With stderr at a terminal the progress bar is there, and it is on stderr: with stdout sent away
 *   the bar is still on the screen, with stderr sent away nothing is.
 * - Against a fake tenant, with the real library: the journeys are listed once and read once each,
 *   the findings of each journey come with the summary by code, and a journey that the tenant
 *   refuses to give is named while the others are still validated.
 */
const manyJourneys = 'test/e2e/exports/all/allAlphaJourneys.journey.json';
const warningJourney =
  'test/e2e/exports/all-separate/cloud-full-import/realm/root-alpha/journey/FrodoTest.journey.json';
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = process.platform === 'win32' ? describe.skip : describe;
const ptySuite = hasPty ? describe : describe.skip;

const TIMEOUT = 120000;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

function validate(args, home) {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(binaryPath, ['journey', 'validate', ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        FRODO_TEST: '',
        FRODO_NO_CACHE: 'true',
        FRODO_NO_PROMPT: '1',
        FRODO_NO_UPDATE_CHECK: '1',
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

suite('journey validate without a terminal', () => {
  let home;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-validate-home-'));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  test(
    'an error: the findings, then the summary by code, then the failed journeys, all on stderr, and exit code 1',
    async () => {
      const { code, stdout, stderr } = await validate(
        ['-a', '-f', manyJourneys],
        home
      );

      expect(code).toBe(1);
      expect(stdout).toBe('');
      const lines = stderr.trim().split('\n');
      expect(lines[0]).toBe('1 error in journey test');
      expect(lines[1]).toMatch(/^ {2}\[MISSING_ENTRY_NODE\] /);
      expect(lines.slice(2)).toEqual([
        'Checked 21 journeys, 1 with findings: 1 error.',
        '  MISSING_ENTRY_NODE: 1 error',
        '1 of 21 journeys failed:',
        '  - test: 1 error',
      ]);
    },
    TIMEOUT
  );

  test(
    'a warning passes, and fails with --strict; --allow-failures keeps the exit code at 0',
    async () => {
      const passes = await validate(['-a', '-f', warningJourney], home);
      const strict = await validate(
        ['-a', '--strict', '-f', warningJourney],
        home
      );
      const allowed = await validate(
        ['-a', '--strict', '--allow-failures', '-f', warningJourney],
        home
      );

      expect(passes.code).toBe(0);
      expect(passes.stderr).toContain(
        'Checked 1 journey, 1 with findings: 1 warning.\n  UNCONNECTED_OUTCOME: 1 warning'
      );
      expect(passes.stderr).not.toContain('failed');
      expect(strict.code).toBe(1);
      expect(strict.stderr).toContain('1 of 1 journey failed:');
      expect(allowed.code).toBe(0);
      expect(allowed.stderr).toContain('--allow-failures');
    },
    TIMEOUT
  );

  test(
    'no bar and no screen control sequences reach a pipe, and a clean run prints what it always did',
    async () => {
      const findings = await validate(['-a', '-f', manyJourneys], home);
      const clean = await validate(
        [
          '-A',
          '-D',
          'test/e2e/exports/all-separate/cloud/realm/root-alpha/journey',
          '-i',
          'Login',
        ],
        home
      );

      for (const output of [findings.stderr, clean.stderr]) {
        expect(output).not.toMatch(/[█░]/u);
        expect(output).not.toContain('\u001b');
        expect(output).not.toContain('Validating ');
      }
      expect(clean.code).toBe(0);
      expect(clean.stderr).toBe('No journey validation findings.\n');
    },
    TIMEOUT
  );
});

ptySuite('journey validate at a terminal', () => {
  let home;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
  });

  afterEach(() => {
    removeShellTestHome(home);
  });

  /** Runs the command in a shell on a terminal, with the redirections of `redirect`. */
  function run(redirect) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: { FRODO_NO_PROMPT: '1', FRODO_NO_UPDATE_CHECK: '1', NO_COLOR: '' },
      binary: '/bin/sh',
      args: [
        '-c',
        `"$0" journey validate -a -f "$1" ${redirect}`,
        binaryPath,
        manyJourneys,
      ],
      actions: [{ type: 'wait_exit', timeoutMs: 60000 }],
    });
  }

  test(
    'stderr at the terminal shows the bar with the journeys done out of all and the journey being checked',
    () => {
      const result = run('1>/dev/null');

      expect(result.exitCode).toBe(1);
      expect(result.plainOutput).toMatch(/\d+\/21 Validating \S+/);
      expect(result.plainOutput).toContain('21/21');
      expect(result.plainOutput).toContain('Checked 21 journeys');
    },
    TIMEOUT
  );

  test(
    'no bar goes to a file: with stdout at the terminal and stderr in a file, the file holds the findings and no bar',
    () => {
      const file = path.join(home, 'findings.log');
      const result = run(`2>"${file}"`);

      const content = fs.readFileSync(file, 'utf8');
      expect(result.exitCode).toBe(1);
      expect(content).toContain('Checked 21 journeys, 1 with findings');
      expect(content).not.toMatch(/[█░]|Validating|\u001b\[\?25/u);
      expect(result.plainOutput).not.toMatch(/[█░]|Validating/u);
    },
    TIMEOUT
  );

  test(
    'the bar is on stderr: with stderr sent away, nothing of it is on the screen',
    () => {
      const result = run('2>/dev/null');

      expect(result.exitCode).toBe(1);
      // (the terminal's own answer to a query of the background colour may be there, the bar is not)
      expect(result.plainOutput).not.toMatch(/[█░]|Validating|\d+\/21/u);
      expect(result.plainOutput).not.toContain('Checked');
    },
    TIMEOUT
  );
});

suite('journey validate against a fake tenant', () => {
  let home;
  let record;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-validate-tenant-'));
    record = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    fs.rmSync(home, { recursive: true, force: true });
  });

  // the fake serves the nodes of a journey by their types only, so each journey has nodes that
  // have no definition, which is a finding
  const JOURNEYS = {
    ZionLogin: { 'node-1': 'UsernameCollectorNode' },
    Registration: { 'node-2': 'SetStateNode' },
    Login: { 'node-3': 'SetStateNode' },
  };

  async function validateAll(options = {}, args = []) {
    fakeAm = await startFakeAm({
      recordPath: record,
      journey: 'password',
      emptyCollections: true,
      journeys: JOURNEYS,
      ...options,
    });
    return new Promise((resolve, reject) => {
      const child = cp.spawn(
        binaryPath,
        [
          'journey',
          'validate',
          '-a',
          ...args,
          '-m',
          'classic',
          `http://127.0.0.1:${fakeAm.port}/am`,
          'alpha',
        ],
        {
          cwd: home,
          env: {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            FRODO_REALM: '',
            FRODO_TEST: '',
            FRODO_NO_CACHE: 'true',
            FRODO_NO_PROMPT: '1',
            FRODO_NO_UPDATE_CHECK: '1',
            NODE_OPTIONS: '',
            NO_COLOR: '1',
            FRODO_USERNAME: 'admin',
            FRODO_PASSWORD: 'secret',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      let stderr = '';
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.once('error', reject);
      child.once('close', (code) => resolve({ code, stderr }));
    });
  }

  const reads = (fragment) =>
    readRequests(record).filter(
      ({ method, url }) => method === 'GET' && url.includes(fragment)
    );

  test(
    'lists the journeys once, reads each once, and sums up by code with one hint',
    async () => {
      const { code, stderr } = await validateAll();

      expect(code).toBe(1);
      expect(reads('/trees?_queryFilter=true')).toHaveLength(1);
      for (const journey of Object.keys(JOURNEYS)) {
        expect(reads(`/trees/${journey}`)).toHaveLength(1);
      }
      expect(stderr).toContain(
        'Checked 3 journeys, 3 with findings: 3 errors and 3 warnings.\n' +
          '  MISSING_NODE_DEFINITION: 3 errors\n' +
          '  NO_REACHABLE_TERMINAL: 3 warnings'
      );
      expect(stderr.match(/These journeys name nodes/g)).toHaveLength(1);
      expect(stderr).toContain('3 of 3 journeys failed:');
    },
    TIMEOUT
  );

  test(
    '--allow-failures keeps the exit code at 0 and prints the same',
    async () => {
      const { code, stderr } = await validateAll({}, ['--allow-failures']);

      expect(code).toBe(0);
      expect(stderr).toContain('Checked 3 journeys, 3 with findings');
      expect(stderr).toContain('The exit code stays 0');
    },
    TIMEOUT
  );

  test(
    'a journey that the tenant refuses to give is named, and the others are still validated',
    async () => {
      const { code, stderr } = await validateAll({
        failRequests: [{ method: 'GET', path: '/trees/Registration' }],
      });

      expect(code).toBe(1);
      expect(reads('/trees/Login')).toHaveLength(1);
      expect(reads('/trees/ZionLogin')).toHaveLength(1);
      // the error of that journey stands where the journey stands in the run, as a block of its own:
      // the line that the library used to put in front of it is gone and the block is one level less indented
      const block =
        "Error validating alpha realm journey 'Registration'\n  Error exporting alpha realm journey Registration\n    Network error:";
      expect(stderr).toContain(`\n${block}`);
      expect(stderr).not.toContain('Error validating alpha realm journeys');
      const login = stderr.indexOf('1 error and 1 warning in journey Login');
      const zion = stderr.indexOf('1 error and 1 warning in journey ZionLogin');
      expect(login).toBeGreaterThan(-1);
      expect(stderr.indexOf(block)).toBeGreaterThan(login);
      expect(zion).toBeGreaterThan(stderr.indexOf(block));
      expect(stderr).toContain('Checked 2 of 3 journeys, 2 with findings');
      expect(stderr).toContain(
        '  - Registration: fake tenant operation failed'
      );
    },
    TIMEOUT
  );
});
