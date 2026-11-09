import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `frodo authz policy delete`: which combination of -a, -i and --set-id may
 * reach which delete (frodo-cli#1163). `--set-id` narrows -a: given without it,
 * the command line is rejected before the login. It used to be accepted and
 * deleted every policy of the realm. The real CLI runs against a fake AM that
 * records every request, with no terminal, so what a command line reached is
 * what the fake saw: no request at all for a rejected or refused command line,
 * and for an accepted one the read of the policies that the delete starts with.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');

const SET = 'zion-set';
const POLICY = 'matrix-policy';
// the read of every policy of the realm, which deletePolicies starts with
const REALM_READ = '/policies?_queryFilter=true';
// the read of one policy set, which deletePoliciesByPolicySet starts with
const SET_READ = `/policies?_queryFilter=applicationName+eq+%22${SET}%22`;
const POLICY_URL = `/policies/${POLICY}`;

const ONE_OF = 'is required to choose what to delete';
const CONFLICT = 'cannot be used with';
const REFUSED = (what) =>
  `Refusing to delete ${what} without confirmation: there is no interactive terminal to ask`;

// [command line, what it must do]. A rejected or refused command line sends no
// request (not even the login); `reads` is the one request path that shows
// which delete an accepted command line went on to.
const MATRIX = [
  ['', { rejected: ONE_OF }],
  ['-y', { rejected: ONE_OF }],
  [`--set-id ${SET}`, { rejected: ONE_OF }],
  [`--set-id ${SET} -y`, { rejected: ONE_OF }],
  ['-a', { rejected: REFUSED('all policies') }],
  ['-a -y', { reads: REALM_READ, notReads: [SET_READ] }],
  [
    `-a --set-id ${SET}`,
    { rejected: REFUSED(`all policies in policy set ${SET}`) },
  ],
  [`-a --set-id ${SET} -y`, { reads: SET_READ, notReads: [REALM_READ] }],
  [`-i ${POLICY}`, { reads: POLICY_URL, notReads: [REALM_READ, SET_READ] }],
  [`-i ${POLICY} -y`, { reads: POLICY_URL, notReads: [REALM_READ, SET_READ] }],
  [`-i ${POLICY} -a`, { rejected: CONFLICT }],
  [`-i ${POLICY} -a -y`, { rejected: CONFLICT }],
  [`-i ${POLICY} --set-id ${SET}`, { rejected: CONFLICT }],
  [`-i ${POLICY} --set-id ${SET} -y`, { rejected: CONFLICT }],
  [`-i ${POLICY} -a --set-id ${SET}`, { rejected: CONFLICT }],
  [`-i ${POLICY} -a --set-id ${SET} -y`, { rejected: CONFLICT }],
];

describe('frodo authz policy delete: what each combination of options reaches', () => {
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
  function deletePolicies(line) {
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'authz',
        'policy',
        'delete',
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

  test.each(MATRIX)('frodo authz policy delete %s', (line, expected) => {
    const result = deletePolicies(line);
    const urls = requestUrls();

    if (expected.rejected) {
      expect(result.status).toBe(1);
      expect(result.output).toContain(expected.rejected);
      // rejected before anything is sent: not even the login
      expect(urls).toEqual([]);
      return;
    }
    // accepted: the login ran and the delete went on to read what it deletes
    expect(urls.some((url) => url.endsWith(expected.reads))).toBe(true);
    for (const wider of expected.notReads) {
      expect(urls.some((url) => url.endsWith(wider))).toBe(false);
    }
    expect(result.output).not.toContain('Refusing to delete');
  });

  test('--set-id alone never reads the policies of the realm', () => {
    // the original report: with --yes there was no question and no refusal
    const result = deletePolicies(`--set-id ${SET} -y`);

    expect(result.status).toBe(1);
    expect(requestUrls().filter((url) => url.includes('/policies'))).toEqual(
      []
    );
  });
});
