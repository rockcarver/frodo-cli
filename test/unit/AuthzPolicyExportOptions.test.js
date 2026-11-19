import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `frodo authz policy export`: which combination of -a, -A, -i and --set-id may
 * reach which export (frodo-cli#1081, the decision of frodo-cli#1163 applied to
 * the export). `--set-id` narrows -a and -A and selects nothing on its own: given
 * without either, the command line is rejected before the login, in the words
 * of every other command with an option rule, with the same exit code as
 * `authz policy delete`. It used to be accepted, and printed the usage after the
 * login. The real CLI runs against a fake AM that records every request, with
 * no terminal: what a command line reached is what the fake saw.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');

const SET = 'zion-set';
const POLICY = 'matrix-policy';
// the read of every policy of the realm, which exporting all of them starts with
const REALM_READ = '/policies?_queryFilter=true';
// the read of one policy set, which exporting the policies of a set starts with
const SET_READ = `/policies?_queryFilter=applicationName+eq+%22${SET}%22`;
const POLICY_URL = `/policies/${POLICY}`;

const ONE_OF = 'is required to choose what to export';
const CONFLICT = 'cannot be used with';

// [command line, what it must do]. A rejected command line sends no request
// (not even the login); `reads` is the one request path that shows which export
// an accepted command line went on to.
const MATRIX = [
  ['', { rejected: ONE_OF }],
  [`--set-id ${SET}`, { rejected: ONE_OF }],
  [`--set-id ${SET} -N`, { rejected: ONE_OF }],
  ['-a', { reads: REALM_READ, notReads: [SET_READ] }],
  ['-A', { reads: REALM_READ, notReads: [SET_READ] }],
  [`-a --set-id ${SET}`, { reads: SET_READ, notReads: [REALM_READ] }],
  [`-A --set-id ${SET}`, { reads: SET_READ, notReads: [REALM_READ] }],
  [`-i ${POLICY}`, { reads: POLICY_URL, notReads: [REALM_READ, SET_READ] }],
  ['-a -A', { rejected: CONFLICT }],
  [`-i ${POLICY} -a`, { rejected: CONFLICT }],
  [`-i ${POLICY} -A`, { rejected: CONFLICT }],
  [`-i ${POLICY} --set-id ${SET}`, { rejected: CONFLICT }],
  [`-i ${POLICY} -a --set-id ${SET}`, { rejected: CONFLICT }],
];

describe('frodo authz policy export: what each combination of options reaches', () => {
  let home;
  let fakeAm;
  let recordPath;

  beforeAll(async () => {
    ensureFrodoArtifact();
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({ recordPath, journey: 'password' });
  });

  afterAll(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  beforeEach(() => {
    fs.writeFileSync(recordPath, '');
  });

  /** Runs the built CLI against the fake AM from the test home, with no terminal. */
  function exportPolicies(line) {
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'authz',
        'policy',
        'export',
        ...line.split(' ').filter(Boolean),
        `http://127.0.0.1:${fakeAm.port}/am`,
        'alpha',
        'someone',
        'secret',
      ],
      {
        cwd: home,
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          FRODO_NO_CACHE: 'true',
          FRODO_NO_PROMPT: '1',
          NO_COLOR: '1',
          FRODO_HOST: '',
          FRODO_REALM: '',
          FRODO_USERNAME: '',
          FRODO_PASSWORD: '',
          FRODO_SA_ID: '',
          FRODO_SA_JWK: '',
          FRODO_CREDENTIAL: '',
        },
      }
    );
    return { ...result, output: result.stdout + result.stderr };
  }

  const requestUrls = () =>
    fs
      .readFileSync(recordPath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).url);

  test.each(MATRIX)('frodo authz policy export %s', (line, expected) => {
    const result = exportPolicies(line);
    const urls = requestUrls();

    if (expected.rejected) {
      expect(result.status).toBe(1);
      expect(result.output).toContain(expected.rejected);
      // rejected before anything is sent: not even the login
      expect(urls).toEqual([]);
      return;
    }
    // accepted: the login ran and the export went on to read what it exports
    expect(urls.some((url) => url.endsWith(expected.reads))).toBe(true);
    for (const wider of expected.notReads) {
      expect(urls.some((url) => url.endsWith(wider))).toBe(false);
    }
  });

  test('--set-id alone is rejected like it is for delete: the same words, the same exit code, no login', () => {
    const exported = exportPolicies(`--set-id ${SET}`);
    expect(exported.status).toBe(1);
    expect(exported.output).toContain(
      "error: one of '-a, --all | -A, --all-separate | -i, --policy-id <policy-id>' is required to choose what to export"
    );
    expect(requestUrls()).toEqual([]);

    // `delete` words it the same way for what it deletes
    const deleted = cp.spawnSync(
      process.execPath,
      [
        launch,
        'authz',
        'policy',
        'delete',
        '--set-id',
        SET,
        `http://127.0.0.1:${fakeAm.port}/am`,
      ],
      {
        cwd: home,
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: home,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          FRODO_NO_CACHE: 'true',
          FRODO_NO_PROMPT: '1',
          NO_COLOR: '1',
        },
      }
    );
    expect(deleted.status).toBe(exported.status);
    expect(deleted.stdout + deleted.stderr).toContain(
      "error: one of '-a, --all | -i, --policy-id <policy-id>' is required to choose what to delete"
    );
  });
});
