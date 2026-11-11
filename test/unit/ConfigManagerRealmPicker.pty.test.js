import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import { atConnectedPage } from '../utils/ConnectionPage.js';
import { answerReady } from '../utils/ReadyStep.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * The realm picker of the config-manager commands, on a real terminal.
 *
 * A config-manager command that uses its realm reads "no realm" as every
 * realm, so its picker has an `All realms` row first, that row is the default,
 * and a realm that is picked really narrows the run (the picker runs inside
 * getTokens(), after the action has bound its `realm` parameter, so the
 * command reads the pick back with realmOfRun). A config-manager command that
 * ignores the realm gets no picker; every other command keeps its picker.
 *
 * Logins, the realm list and the journey and script lists go to a fake AM with
 * the realms alpha and bravo. What a run asked for is read from the request
 * log of the fake AM: the realm of each journey or script list request.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  FRODO_SA_ID: 'test-account',
  FRODO_SA_JWK: serviceAccountJwk,
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

const JOURNEYS = /\/authenticationtrees\/trees/;
const SCRIPTS = /\/scripts(\?|$)/;

/** The realm in the path of a realm-scoped request. */
const realmOf = (url) => url.match(/\/realms\/root\/realms\/([^/]+)\//)?.[1];

/** The picker as last drawn: a capture holds every frame since the last clear. */
const lastFrame = (plain) => plain.split('┌ Navigate').pop();
const footer = (frame) => frame.split('└').pop();

suite(
  'the realm picker of the config-manager commands, on a real terminal',
  () => {
    let home;
    let outDir;
    let configDir;
    let recordPath;
    let fakeAm;

    beforeAll(() => {
      ensureFrodoArtifact();
    });

    beforeEach(async () => {
      home = createShellTestHome();
      // the run writes where it is told to (-D), never into the checkout
      outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-rp-out-'));
      configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-rp-cfg-'));
      recordPath = path.join(home, 'requests.jsonl');
      fakeAm = await startFakeAm({
        journey: 'service-account',
        realms: ['alpha', 'bravo'],
        scripts: ['matrix-check'],
        trees: [],
        recordPath,
      });
    });

    afterEach(() => {
      fakeAm?.stop();
      fakeAm = undefined;
      removeShellTestHome(home);
      fs.rmSync(outDir, { recursive: true, force: true });
      fs.rmSync(configDir, { recursive: true, force: true });
    });

    const host = () => `http://127.0.0.1:${fakeAm.port}/am`;

    const requests = () =>
      fs.existsSync(recordPath)
        ? fs
            .readFileSync(recordPath, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [];

    /** The realms (sorted, once each) that the run asked a list of that kind for. */
    const realmsAsked = (kind) =>
      [
        ...new Set(
          requests()
            .filter((request) => kind.test(request.url))
            .map((request) => realmOf(request.url))
            .filter(Boolean)
        ),
      ].sort();

    /**
     * `frodo config-manager <command> --type cloud` with no host: the host is
     * asked for, the pass logs in, and the connection page opens with the realm
     * row (record 0046): it needs the login, which the pass makes, so it comes
     * before the Ready step, which is answered with Run.
     * `choose` are the keys in the box of the realms that Enter opens on the row
     * (Escape closes it, keeping the default); `waitFor` is the request
     * that proves the run got as far as it should; `settleMs` lets any request
     * that must NOT happen show up before the log is read.
     */
    function pick({ command, choose, waitFor, settleMs = 2500, highlight }) {
      return runShellScenario({
        homeDir: home,
        allowPrompting: true,
        env: {
          ...noCredentials,
          FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
        },
        args: [...command, '-D', outDir, '--type', 'cloud'],
        actions: [
          { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 60000 },
          { type: 'send_line', text: host() },
          ...atConnectedPage('page'),
          // the cursor is on Done: up to the realm row, Enter opens the realms
          { type: 'key', name: 'up' },
          { type: 'key', name: 'enter' },
          { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 60000 },
          { type: 'sleep', ms: 500 },
          // the keys that move the cursor without choosing: the footer follows them
          ...(highlight ?? []),
          { type: 'sleep', ms: 400 },
          { type: 'capture', label: 'picker' },
          { type: 'clear_output' },
          ...choose,
          // (the first Escape waits for a second one before it closes the box)
          { type: 'sleep', ms: 900 },
          { type: 'key', name: 'down' },
          { type: 'sleep', ms: 300 },
          { type: 'key', name: 'enter' },
          ...answerReady(),
          {
            type: 'wait_request',
            path: recordPath,
            regex: waitFor.source,
            timeoutMs: 100000,
          },
          { type: 'sleep', ms: settleMs },
          { type: 'capture', label: 'after' },
        ],
      });
    }

    const ENTER = { type: 'key', name: 'enter' };
    const DOWN = { type: 'key', name: 'down' };
    const ESCAPE = { type: 'key', name: 'escape' };

    /**
     * The command as the run printed it last, from `frodo <name>` to the end
     * of the line (the line may follow the answered picker on the same row);
     * the lines before it are the footers of the picker while the cursor moved.
     */
    const commandAsRun = (plain, name) => {
      const line = plain
        .split('\n')
        .filter((l) => l.includes(`frodo ${name}`))
        .at(-1);
      return line?.slice(line.indexOf(`frodo ${name}`));
    };

    describe('a command that uses its realm: pull journeys', () => {
      const command = ['config-manager', 'pull', 'journeys'];
      const BRAVO_JOURNEYS = /realms\/bravo\/.*authenticationtrees\/trees/;
      const ALPHA_JOURNEYS = /realms\/alpha\/.*authenticationtrees\/trees/;

      test('the picker offers All realms first, as the default, and says what it means', () => {
        const run = pick({ command, choose: [ENTER], waitFor: BRAVO_JOURNEYS });
        const frame = lastFrame(run.captures.picker.plain);
        expect(run.captures.picker.plain).toContain(
          'Choose a realm (All realms is the default):'
        );
        // the rows, in order, with the pointer on the first
        // (the default row says so)
        const rows = [
          ...frame.matchAll(
            /^│ ([› ]) (All realms|alpha|bravo)(?: \([^)]*\))?\s*│$/gm
          ),
        ];
        expect(rows.map((row) => row[2])).toEqual([
          'All realms',
          'alpha',
          'bravo',
        ]);
        expect(rows[0][1]).toBe('›');
        // the footer is the command as the default would run it: no realm token
        expect(footer(frame)).toContain('frodo config-manager pull journeys');
        expect(footer(frame)).not.toMatch(/\s(alpha|bravo)(\s|$)/);
      });

      test('Enter on All realms pulls every realm, and the command line shows no realm', () => {
        const run = pick({ command, choose: [ENTER], waitFor: BRAVO_JOURNEYS });
        expect(realmsAsked(JOURNEYS)).toEqual(['alpha', 'bravo']);
        const line = commandAsRun(
          run.captures.after.plain,
          'config-manager pull journeys'
        );
        expect(line).toBeDefined();
        expect(line).not.toMatch(/\s(alpha|bravo)(\s|$)/);
      });

      test('Escape pulls every realm', () => {
        pick({ command, choose: [ESCAPE], waitFor: BRAVO_JOURNEYS });
        expect(realmsAsked(JOURNEYS)).toEqual(['alpha', 'bravo']);
      });

      test('alpha, the default realm of the deployment, narrows the run to alpha', () => {
        const run = pick({
          command,
          choose: [DOWN, ENTER],
          waitFor: ALPHA_JOURNEYS,
        });
        expect(realmsAsked(JOURNEYS)).toEqual(['alpha']);
        const line = commandAsRun(
          run.captures.after.plain,
          'config-manager pull journeys'
        );
        expect(line).toMatch(/\salpha(\s|$)/);
      });

      test('bravo narrows the run to bravo, and the command line says so', () => {
        const run = pick({
          command,
          choose: [DOWN, DOWN, ENTER],
          waitFor: BRAVO_JOURNEYS,
        });
        expect(realmsAsked(JOURNEYS)).toEqual(['bravo']);
        const line = commandAsRun(
          run.captures.after.plain,
          'config-manager pull journeys'
        );
        expect(line).toMatch(/\sbravo(\s|$)/);
      });

      test('the footer follows the highlighted row before anything is chosen', () => {
        const run = pick({
          command,
          highlight: [DOWN, DOWN],
          choose: [ENTER],
          waitFor: BRAVO_JOURNEYS,
        });
        // bravo was highlighted, then chosen: the capture before the choice shows it
        expect(footer(lastFrame(run.captures.picker.plain))).toMatch(
          /\sbravo(\s|$)/
        );
        expect(realmsAsked(JOURNEYS)).toEqual(['bravo']);
      });

      test('a realm typed on the command line is used and no picker opens', () => {
        const run = runShellScenario({
          homeDir: home,
          allowPrompting: true,
          env: {
            ...noCredentials,
            FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          },
          args: [...command, host(), 'alpha', '-D', outDir, '--type', 'cloud'],
          actions: [
            {
              type: 'wait_request',
              path: recordPath,
              regex: ALPHA_JOURNEYS.source,
              timeoutMs: 60000,
            },
            { type: 'sleep', ms: 2500 },
          ],
        });
        expect(run.plainOutput).not.toContain('Choose a realm');
        expect(realmsAsked(JOURNEYS)).toEqual(['alpha']);
      });
    });

    describe('a command that uses its realm: pull scripts', () => {
      const command = ['config-manager', 'pull', 'scripts'];

      test('Enter on All realms pulls every realm', () => {
        pick({
          command,
          choose: [ENTER],
          waitFor: /realms\/bravo\/scripts/,
        });
        expect(realmsAsked(SCRIPTS)).toEqual(['alpha', 'bravo']);
      });

      test('bravo narrows the run to bravo', () => {
        pick({
          command,
          choose: [DOWN, DOWN, ENTER],
          waitFor: /realms\/bravo\/scripts/,
        });
        expect(realmsAsked(SCRIPTS)).toEqual(['bravo']);
      });
    });

    describe('pull all, which also covers the tenant', () => {
      const command = ['config-manager', 'pull', 'all', '-C', 'CONFIG'];
      const withConfig = () =>
        command.map((token) => (token === 'CONFIG' ? configDir : token));

      test('the picker says that tenant-wide config is always included', () => {
        const run = pick({
          command: withConfig(),
          choose: [ENTER],
          waitFor: /realms\/bravo\/.*authenticationtrees\/trees/,
        });
        expect(run.captures.picker.plain).toContain(
          'Choose a realm (realm-specific config only; tenant-wide config is always included):'
        );
      });

      test('Enter on All realms pulls the journeys of every realm', () => {
        pick({
          command: withConfig(),
          choose: [ENTER],
          waitFor: /realms\/bravo\/.*authenticationtrees\/trees/,
        });
        expect(realmsAsked(JOURNEYS)).toEqual(['alpha', 'bravo']);
      });

      test('bravo pulls the journeys of bravo only', () => {
        pick({
          command: withConfig(),
          choose: [DOWN, DOWN, ENTER],
          waitFor: /realms\/bravo\/.*authenticationtrees\/trees/,
          settleMs: 4000,
        });
        expect(realmsAsked(JOURNEYS)).toEqual(['bravo']);
      });
    });

    describe('commands that keep their picker, or have none', () => {
      test('a command outside config-manager keeps its picker: the default realm is highlighted and there is no All realms row', () => {
        const run = pick({
          command: ['journey', 'list'],
          choose: [ENTER],
          waitFor: /realms\/alpha\/.*authenticationtrees\/trees/,
        });
        const picker = run.captures.picker.plain;
        expect(picker).toContain('Choose a realm (default: alpha):');
        expect(picker).not.toContain('All realms');
      });

      test('a config-manager command that ignores the realm opens no picker', () => {
        const run = runShellScenario({
          homeDir: home,
          allowPrompting: true,
          env: {
            ...noCredentials,
            FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
          },
          args: [
            'config-manager',
            'pull',
            'cors',
            '-D',
            outDir,
            '--type',
            'cloud',
          ],
          actions: [
            { type: 'wait_plain', regex: 'AM base URL:', timeoutMs: 60000 },
            { type: 'send_line', text: host() },
            ...answerReady(),
            {
              type: 'wait_request',
              path: recordPath,
              // the first request of the command itself, after the login
              // (where the picker would have opened)
              regex: 'global-config/services',
              timeoutMs: 60000,
            },
            { type: 'sleep', ms: 1500 },
          ],
        });
        expect(run.plainOutput).not.toContain('Choose a realm');
      });
    });
  }
);
