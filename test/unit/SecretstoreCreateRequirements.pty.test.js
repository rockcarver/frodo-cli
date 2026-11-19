import cp from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { readRequests } from '../utils/FakeAmLog.js';
import { answerReady } from '../utils/ReadyStep.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * `secretstore mapping create` and `secretstore mapping alias create` need
 * three options (the store, the mapping and what to add), not any one of five
 * (frodo-cli#1081): they declare `requireAllOf` for those three, so an
 * incomplete command line is rejected before the login with the standard
 * message, and on a terminal the store (and, for an alias, the mapping) are
 * picked from the tenant for the member that is missing. The real CLI runs
 * against a fake tenant that records every request.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const launch = path.join(ROOT, 'dist/launch.cjs');

const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const TIMEOUT = 120000;
const STORES = {
  stores: [
    { _id: 'zion-store', type: 'KeyStoreSecretStore' },
    { _id: 'matrix-store', type: 'KeyStoreSecretStore' },
  ],
  mappings: {
    'zion-store': [
      { secretId: 'am.zion.one', aliases: ['one-a'] },
      { secretId: 'am.zion.two', aliases: ['two-a'] },
    ],
  },
};

const MAPPING_ALL_OF =
  "error: all of '-i, --secretstore-id <secretstore-id> + -s, --secret-id <secret-id> + -a, --aliases <aliases>' are required to choose the mapping to create";
const ALIAS_ALL_OF =
  "error: all of '-i, --secretstore-id <secretstore-id> + -s, --secret-id <secret-id> + -a, --alias <alias>' are required to choose the alias to create";
const CREATE_MAPPING = '/zion-store/mappings?_action=create';

const MAPPING = 'secretstore mapping create';
const ALIAS = 'secretstore mapping alias create';

// [command, command line, what it must do]. A rejected command line sends no
// request, not even the login; `reaches` is the request (method and text of the
// URL) that shows an accepted command line went on to create.
const MATRIX = [
  [MAPPING, '', { rejected: MAPPING_ALL_OF }],
  [MAPPING, '-g', { rejected: MAPPING_ALL_OF }],
  [MAPPING, '-t KeyStoreSecretStore', { rejected: MAPPING_ALL_OF }],
  [MAPPING, '-i zion-store', { rejected: MAPPING_ALL_OF }],
  [MAPPING, '-i zion-store -s am.new', { rejected: MAPPING_ALL_OF }],
  [MAPPING, '-s am.new -a a1', { rejected: MAPPING_ALL_OF }],
  [MAPPING, '-g -a a1', { rejected: MAPPING_ALL_OF }],
  [
    MAPPING,
    '-i zion-store -s am.new -a a1',
    { reaches: ['POST', CREATE_MAPPING] },
  ],
  [
    MAPPING,
    '-i zion-store -s am.new -a a1,a2 -t KeyStoreSecretStore',
    { reaches: ['POST', CREATE_MAPPING] },
  ],
  [
    MAPPING,
    '-i zion-store -s am.new -a a1 -t EnvironmentAndSystemPropertySecretStore',
    {
      refused:
        "'EnvironmentAndSystemPropertySecretStore' does not have mappings.",
    },
  ],
  [ALIAS, '', { rejected: ALIAS_ALL_OF }],
  [ALIAS, '-g', { rejected: ALIAS_ALL_OF }],
  [ALIAS, '-i zion-store', { rejected: ALIAS_ALL_OF }],
  [ALIAS, '-i zion-store -s am.zion.one', { rejected: ALIAS_ALL_OF }],
  [ALIAS, '-i zion-store -a three-a', { rejected: ALIAS_ALL_OF }],
  [ALIAS, '-s am.zion.one -a three-a', { rejected: ALIAS_ALL_OF }],
  [
    ALIAS,
    '-i zion-store -s am.zion.one -a three-a',
    { reaches: ['PUT', '/zion-store/mappings/am.zion.one'] },
  ],
];

suite(
  'secretstore mapping create and alias create, with the options they need',
  () => {
    let home;
    let recordPath;
    let fakeAm;
    let tenant;

    beforeAll(() => {
      ensureFrodoArtifact();
    });

    beforeEach(async () => {
      home = createShellTestHome();
      recordPath = path.join(home, 'requests.jsonl');
      fakeAm = await startFakeAm({
        recordPath,
        journey: 'password',
        secretStores: STORES,
      });
      tenant = `http://127.0.0.1:${fakeAm.port}/am`;
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      removeShellTestHome(home);
    });

    const requests = () => readRequests(recordPath);
    const urls = () => requests().map((request) => request.url);

    /** Runs the built CLI against the fake tenant, with no terminal. */
    function cli(command, line) {
      const result = cp.spawnSync(
        process.execPath,
        [
          launch,
          ...command.split(' '),
          ...line.split(' ').filter(Boolean),
          tenant,
          '/',
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

    test.each(MATRIX)(
      'frodo %s %s without a terminal',
      (command, line, expected) => {
        const result = cli(command, line);
        if (expected.rejected) {
          expect(result.status).toBe(1);
          expect(result.output).toContain(expected.rejected);
          // rejected before anything is sent: not even the login
          expect(urls()).toEqual([]);
          return;
        }
        if (expected.refused) {
          expect(result.status).toBe(1);
          expect(result.output).toContain(expected.refused);
          expect(urls()).toEqual([]);
          return;
        }
        expect(result.status).toBe(0);
        const [method, text] = expected.reaches;
        expect(
          requests().some(
            (request) => request.method === method && request.url.includes(text)
          )
        ).toBe(true);
        // nothing was asked, nothing was picked: the stores are read once to find
        // the type of the store the command names, and only to create
        expect(result.output).not.toContain('Select secret store');
      }
    );

    // -- on a terminal -------------------------------------------------------

    const noCredentials = {
      FRODO_HOST: '',
      FRODO_REALM: '',
      FRODO_USERNAME: 'someone',
      FRODO_PASSWORD: 'not-a-password',
      FRODO_SA_ID: '',
      FRODO_SA_JWK: '',
      FRODO_CREDENTIAL: '',
      FRODO_NO_PROMPT: '',
      NO_COLOR: '__FRODO_PTY_DELETE__',
    };

    function onTerminal(command, args, actions) {
      return runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: {
          ...noCredentials,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
        },
        args: [
          ...command.split(' '),
          tenant,
          '/',
          '--type',
          'classic',
          ...args,
        ],
        actions,
      });
    }

    const lastFrame = (plain) => plain.split('┌ Navigate').pop();
    /** The footer of a frame: the command, which wraps on this terminal. */
    const footer = (frame) => frame.split('└').pop().replace(/\n/g, '');
    /** The box under the Navigate bar: the rows of the menu or the picker. */
    const rows = (frame) => frame.split('└')[1];
    const waitFor = (regex) => ({
      type: 'wait_plain',
      regex,
      timeoutMs: 30000,
    });
    const settle = { type: 'sleep', ms: 500 };
    /** Chooses a member in the menu of the group by typing its flag. */
    const choose = (flag) => [
      waitFor('Choose the (mapping|alias) to create'),
      settle,
      { type: 'send', text: flag },
      { type: 'sleep', ms: 400 },
      { type: 'key', name: 'enter' },
    ];
    /** Types the value of the member that was chosen. */
    const type = (flag, value) => [
      waitFor(`Enter a value for ${flag}`),
      settle,
      { type: 'send', text: value },
      { type: 'key', name: 'enter' },
    ];

    describe('on a terminal', () => {
      test(
        'mapping create asks for every member in turn, and picks the secret store',
        async () => {
          const result = onTerminal(
            MAPPING,
            [],
            [
              ...choose('secretstore-id'),
              waitFor('Choose the mapping to create'),
              settle,
              { type: 'capture', label: 'second' },
              { type: 'send', text: 'secret-id' },
              { type: 'sleep', ms: 400 },
              { type: 'key', name: 'enter' },
              ...type('-s', 'am.new'),
              ...type('-a', 'a1,a2'),
              waitFor('Select secret store to act on'),
              settle,
              { type: 'capture', label: 'store' },
              // the stores are sorted: matrix-store, zion-store
              { type: 'key', name: 'down' },
              { type: 'key', name: 'enter' },
              ...answerReady(),
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(0);
          // the member that was chosen is not offered again
          const second = rows(lastFrame(result.captures.second.plain));
          expect(second).not.toContain('--secretstore-id');
          expect(second).toContain('--secret-id');
          expect(second).toContain('--aliases');
          // the store pick lists the stores of the realm
          const stores = lastFrame(result.captures.store.plain);
          expect(stores).toContain('matrix-store');
          expect(stores).toContain('zion-store');
          // the mapping is created in the store that was picked, with what was typed
          expect(result.plainOutput).toContain(
            'Created the mapping am.new in the secret store zion-store'
          );
          const created = requests().filter((r) =>
            r.url.includes(CREATE_MAPPING)
          );
          expect(created).toHaveLength(1);
          expect(JSON.parse(created[0].body)).toMatchObject({
            secretId: 'am.new',
          });
          // the pick is not offered for --secret-id: it is the label of the mapping that is created
          expect(result.plainOutput).not.toContain(
            'Select secret store mapping'
          );
        },
        TIMEOUT
      );

      test(
        'mapping create asks for the store only when -i is the member that is missing',
        async () => {
          const result = onTerminal(
            MAPPING,
            ['-s', 'am.new', '-a', 'a1'],
            [
              waitFor('Select secret store to act on'),
              settle,
              { type: 'key', name: 'down' },
              { type: 'key', name: 'enter' },
              ...answerReady(),
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(0);
          // no menu: the other two members were given
          expect(result.plainOutput).not.toContain(
            'Choose the mapping to create'
          );
          expect(urls().some((url) => url.includes(CREATE_MAPPING))).toBe(true);
        },
        TIMEOUT
      );

      test(
        'alias create picks the secret store, then the mapping of that store',
        async () => {
          const result = onTerminal(
            ALIAS,
            ['-a', 'three-a'],
            [
              ...choose('secretstore-id'),
              // the mapping is the last member that is missing: no menu for it
              waitFor('Select secret store to act on'),
              settle,
              // the stores are sorted: matrix-store, zion-store
              { type: 'key', name: 'down' },
              { type: 'key', name: 'enter' },
              waitFor('Select secret store mapping to act on'),
              settle,
              { type: 'capture', label: 'mapping' },
              { type: 'key', name: 'down' },
              { type: 'key', name: 'enter' },
              waitFor('Ready to run\\?'),
              settle,
              { type: 'capture', label: 'ready' },
              { type: 'key', name: 'enter' },
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          const mappings = lastFrame(result.captures.mapping.plain);
          expect(mappings).toContain('am.zion.one');
          expect(mappings).toContain('am.zion.two');
          const command = footer(lastFrame(result.captures.ready.plain));
          expect(command).toContain('--secretstore-id zion-store');
          expect(command).toContain('--secret-id am.zion.two');
          expect(command).toContain('--alias three-a');
          // the alias goes to the mapping that was picked, in the store that was picked
          expect(
            urls().some((url) =>
              url.includes('/zion-store/mappings/am.zion.two')
            )
          ).toBe(true);
          // the mappings were read from the store that was picked, after it was picked
          const read = urls().findIndex((url) =>
            url.includes('/zion-store/mappings?_queryFilter=true')
          );
          expect(read).toBeGreaterThan(-1);
        },
        TIMEOUT
      );

      test(
        'a declined pick of the store creates nothing, exit code 1',
        async () => {
          const result = onTerminal(
            MAPPING,
            ['-s', 'am.new', '-a', 'a1'],
            [
              waitFor('Select secret store to act on'),
              settle,
              { type: 'key', name: 'escape' },
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(1);
          expect(urls().some((url) => url.includes(CREATE_MAPPING))).toBe(
            false
          );
          expect(result.plainOutput).not.toContain('Created');
        },
        TIMEOUT
      );

      test(
        'a complete command line opens no picker',
        async () => {
          const result = onTerminal(
            MAPPING,
            ['-i', 'zion-store', '-s', 'am.new', '-a', 'a1'],
            [
              { type: 'wait_exit', timeoutMs: 30000 },
              { type: 'sleep', ms: 300 },
            ]
          );
          expect(result.exitCode).toBe(0);
          expect(result.plainOutput).not.toContain('Select secret store');
          expect(result.plainOutput).not.toContain('Choose the mapping');
          expect(urls().some((url) => url.includes(CREATE_MAPPING))).toBe(true);
        },
        TIMEOUT
      );
    });
  }
);
