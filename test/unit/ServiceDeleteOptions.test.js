import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `frodo service delete`: which combination of -i, -a, -g and -y may reach
 * which delete (frodo-cli#1081). The command did not say that it needs -i or
 * -a, so `service delete -y` logged in and deleted every service, and a line
 * without either was refused only after the login. It declares the group now,
 * as every other delete command does: a line without -i and -a is rejected
 * before the login. The real CLI runs against a fake AM that records every
 * request, with no terminal: what a command line reached is what the fake saw.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');

const ONE_OF = "error: one of '-i, --id <id> | -a, --all' is required";
const REFUSED =
  'Refusing to delete all services without confirmation: there is no interactive terminal to ask';
const CONFLICT = 'cannot be used with';
// the list of the services of the realm, which the delete of all of them starts with
const REALM_LIST =
  '/realms/alpha/realm-config/services?_action=nextdescendents';
// the same list of the global services
const GLOBAL_LIST = '/global-config/services?_action=nextdescendents';

// [command line, what it must do]. A rejected or refused command line sends no
// request (not even the login); `lists` is the request that shows which delete
// an accepted command line went on to.
const MATRIX = [
  ['', { rejected: ONE_OF }],
  ['-y', { rejected: ONE_OF }],
  ['-g', { rejected: ONE_OF }],
  ['-g -y', { rejected: ONE_OF }],
  ['-a', { refused: REFUSED }],
  ['-a -g', { refused: REFUSED }],
  ['-a -y', { lists: REALM_LIST, notLists: [GLOBAL_LIST] }],
  ['-a -g -y', { lists: GLOBAL_LIST, notLists: [REALM_LIST] }],
  ['-i baseurl', { lists: '/services/baseurl', notLists: [REALM_LIST] }],
  ['-i baseurl -y', { lists: '/services/baseurl', notLists: [REALM_LIST] }],
  ['-i baseurl -a', { rejected: CONFLICT }],
  ['-i baseurl -a -y', { rejected: CONFLICT }],
];

describe('frodo service delete: what each combination of options reaches', () => {
  let home;
  let fakeAm;
  let recordPath;

  beforeAll(async () => {
    ensureFrodoArtifact();
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      services: ['baseurl', 'authenticatorOath'],
    });
  });

  afterAll(() => {
    fakeAm?.stop();
    removeShellTestHome(home);
  });

  beforeEach(() => {
    fs.writeFileSync(recordPath, '');
  });

  /** Runs the built CLI against the fake AM from the test home, with no terminal. */
  function deleteServices(line) {
    const result = cp.spawnSync(
      process.execPath,
      [
        launch,
        'service',
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

  test.each(MATRIX)('frodo service delete %s', (line, expected) => {
    const result = deleteServices(line);
    const urls = requestUrls();

    if (expected.rejected || expected.refused) {
      expect(result.status).toBe(1);
      expect(result.output).toContain(expected.rejected ?? expected.refused);
      // rejected or refused before anything is sent: not even the login
      expect(urls).toEqual([]);
      return;
    }
    // accepted: the login ran and the delete went on to read what it deletes
    expect(urls.some((url) => url.includes(expected.lists))).toBe(true);
    for (const wider of expected.notLists) {
      expect(urls.some((url) => url.includes(wider))).toBe(false);
    }
    expect(result.output).not.toContain('Refusing to delete');
  });

  test('-y alone never reaches the list of the services, which the delete of all of them starts with', () => {
    // the original defect: with -y there was no question and no refusal
    const result = deleteServices('-y');

    expect(result.status).toBe(1);
    expect(requestUrls().filter((url) => url.includes('/services'))).toEqual(
      []
    );
  });
});
