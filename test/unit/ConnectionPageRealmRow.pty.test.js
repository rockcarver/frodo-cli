import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  atConnectedPage,
  CONNECTED,
  fillCredentials,
  footerOf,
  lastPage,
  navigateOf,
  pickRealmOnPage,
} from '../utils/ConnectionPage.js';
import { loginCount, readRequests } from '../utils/FakeAmLog.js';
import { answerReady } from '../utils/ReadyStep.js';
import { replayScreen } from '../utils/ScreenReplay.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * Decision record 0046, on a real terminal against a fake tenant: the realm is
 * a row of the connection page, and Done on a complete page logs in.
 *
 * - host and credentials on the page, Done (`connect`), `Logging in...`, the
 *   page opens again with `Connected as ...` and a `realm` row, a realm is
 *   chosen, Done (`next`), the command runs in that realm after ONE login;
 * - a system with one realm shows no row and asks no second Enter;
 * - a saved connection that needs no page shows the page anyway, connected,
 *   when there is a realm to choose;
 * - a failed login is shown on the page and ends the command, no retry;
 * - editing the host after the login logs in again and forgets the realm;
 * - Escape cancels (exit 0); Escape on the realm choices keeps the default;
 * - a complete command line, a realm named and `--no-prompt` open no page and
 *   make no login in the pass.
 *
 * The request log of the fake tenant is the proof of what happened when: a
 * login is the authenticate call that starts a journey (FakeAmLog.js).
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const TIMEOUT = 240000;
const OTHER_TENANT = 'https://zion.example.com/am';
const noCredentials = {
  FRODO_HOST: '',
  FRODO_REALM: '',
  FRODO_USERNAME: '',
  FRODO_PASSWORD: '',
  FRODO_SA_ID: '',
  FRODO_SA_JWK: '',
  FRODO_CREDENTIAL: '',
  FRODO_NO_PROMPT: '',
  NO_COLOR: '__FRODO_PTY_DELETE__',
};

const ENTER = { type: 'key', name: 'enter' };
const ESCAPE = { type: 'key', name: 'escape' };
const DOWN = { type: 'key', name: 'down' };
const UP = { type: 'key', name: 'up' };

/** The frames drawn so far, oldest first: every frame starts with its Navigate box. */
const framesOf = (plain) => plain.split('┌ Navigate').slice(1);

suite('the realm is a row of the connection page, on a real terminal', () => {
  let home;
  let recordPath;
  const tenants = [];

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  beforeEach(() => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    for (const tenant of tenants.splice(0)) tenant.stop();
    removeShellTestHome(home);
  });

  /** A fake tenant that records its requests to `name`; `options` change how it behaves. */
  async function startTenant(options = {}, name = 'requests.jsonl') {
    const tenant = await startFakeAm({
      recordPath: path.join(home, name),
      journey: 'password',
      realms: ['alpha', 'bravo'],
      trees: ['zion-login', 'matrix-login'],
      ...options,
    });
    tenants.push(tenant);
    return `http://127.0.0.1:${tenant.port}/am`;
  }

  /** Runs frodo with no connection profile unless `profiles` names some. */
  function run(args, actions, { env = {}, profiles } = {}) {
    const profilesPath = path.join(home, 'Connections.json');
    fs.writeFileSync(profilesPath, JSON.stringify(profiles ?? {}));
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: profilesPath,
        ...env,
      },
      args,
      actions,
    });
  }

  const requests = (name = 'requests.jsonl') =>
    readRequests(path.join(home, name));

  /** The realm a realm-scoped request went to. */
  const realmOf = (url) => url.match(/\/realms\/root\/realms\/([^/]+)\//)?.[1];

  /** Whether a request went to the root realm (a classic deployment's default, which the realm list does not hold). */
  const inRootRealm = (url) =>
    url.includes('/json/realms/root/realm-config/') && !realmOf(url);

  /** The page with the host on the command line: credentials, then Done. */
  const toDonePage = [
    { type: 'wait_plain', regex: 'Connection:', timeoutMs: 60000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label: 'before' },
    ...fillCredentials(),
    { type: 'capture', label: 'complete' },
  ];

  describe('host and credentials on the page, then the realm', () => {
    test(
      'Done logs in, the Realm row appears, the realm chosen is the one the command runs in, after ONE login',
      async () => {
        const tenant = await startTenant({ loginDelayMs: 1500 });
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            { type: 'clear_output' },
            ENTER,
            // the login runs on the page: its frame says so
            {
              type: 'wait_plain',
              regex: 'Logging in\\.\\.\\.',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'logging' },
            ...atConnectedPage('connected'),
            UP,
            ENTER,
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'realms' },
            // the footer follows the highlighted realm before Enter
            DOWN,
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'highlighted' },
            { type: 'send', text: 'bravo' },
            { type: 'sleep', ms: 300 },
            ENTER,
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'chosen' },
            DOWN,
            { type: 'sleep', ms: 300 },
            ENTER,
            { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'ready' },
            { type: 'clear_output' },
            ENTER,
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'after' },
          ]
        );
        const { captures } = result;

        // before the login: the host, the credentials, no realm; Enter edits a row
        expect(captures.before.plain).toContain('host: ');
        expect(captures.before.plain).toContain('username: (not set)');
        expect(captures.before.plain).not.toContain('realm:');
        expect(navigateOf(lastPage(captures.before.plain))).toContain(
          '[ENTER] edit'
        );
        // complete: Enter on Done connects
        expect(lastPage(captures.complete.plain)).toContain(
          'Done — log in with these values'
        );
        expect(navigateOf(lastPage(captures.complete.plain))).toContain(
          '[ENTER] connect'
        );

        // while it logs in the page says so, in its own frame
        const logging = lastPage(captures.logging.plain);
        expect(logging).toContain('Connection:');
        expect(logging).toContain('Logging in...');
        expect(logging).toContain('Done — log in with these values');
        // and the frame is gone when the page opens again
        expect(
          replayScreen(captures.connected.raw)
            .join('\n')
            .match(/Logging in/g)
        ).toBeNull();

        // after the login: who is logged in, the realm row with its default, Done says next
        const connected = lastPage(captures.connected.plain);
        expect(connected).toContain('Connected as');
        expect(connected).toMatch(/realm: \/ \(default\)/);
        expect(navigateOf(connected)).toContain('[ENTER] next');
        expect(connected).toContain('Done — continue with these values');

        // the realms of the system are in a box under the page
        const realms = lastPage(captures.realms.plain);
        expect(realms).toContain('Choose a realm');
        expect(realms).toMatch(/› \/ \(default\)/);
        expect(realms).toMatch(/^│ {3}alpha/m);
        expect(realms).toMatch(/^│ {3}bravo/m);
        // the footer follows the highlighted realm
        expect(footerOf(lastPage(captures.highlighted.plain))).toContain(
          ' alpha '
        );
        expect(footerOf(lastPage(captures.realms.plain))).not.toContain(
          'alpha'
        );

        // the row shows the choice, and the footer the command with it
        expect(lastPage(captures.chosen.plain)).toMatch(/realm: bravo\s*│/);
        expect(footerOf(lastPage(captures.chosen.plain))).toContain(
          `journey list ${tenant} bravo someone ********`
        );
        expect(footerOf(lastPage(captures.ready.plain))).toContain(
          `journey list ${tenant} bravo someone ********`
        );

        // the realm prompt of the pass is not shown: every frame that offers the
        // realms is the connection page
        const offering = framesOf(captures.ready.plain).filter((frame) =>
          frame.includes('Choose a realm')
        );
        expect(offering.length).toBeGreaterThan(0);
        expect(offering.every((frame) => frame.includes('Connection:'))).toBe(
          true
        );

        // the command ran in the realm that was chosen, after one login
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(
          log.filter((r) => r.url.includes('/global-config/realms'))
        ).toHaveLength(1);
        const trees = log.filter((r) =>
          /\/authenticationtrees\/trees(\?|$)/.test(r.url)
        );
        expect(trees).toHaveLength(1);
        expect(realmOf(trees[0].url)).toBe('bravo');
        expect(captures.after.plain).not.toContain('Navigate');
      },
      TIMEOUT
    );

    test(
      'a message the login prints takes the frame away first: nothing of "Logging in..." is left on the screen',
      async () => {
        const tenant = await startTenant({ loginDelayMs: 1200 });
        const result = run(
          ['journey', 'list', tenant, '--verbose'],
          [
            ...toDonePage,
            { type: 'clear_output' },
            ENTER,
            {
              type: 'wait_plain',
              regex: 'Logging in\\.\\.\\.',
              timeoutMs: 30000,
            },
            ...atConnectedPage('connected'),
          ]
        );
        const screen = replayScreen(result.captures.connected.raw).join('\n');
        // the verbose line of the login is there, above the page, once
        expect(screen.match(/Connected to /g)).toHaveLength(1);
        expect(screen).toContain('Connected as');
        expect(screen).not.toContain('Logging in');
        // and the page is whole: one Navigate box, one panel
        expect(screen.match(/┌ Navigate/g)).toHaveLength(1);
        expect(screen.match(/┌ \? Connection:/g)).toHaveLength(1);
      },
      TIMEOUT
    );

    test(
      'Done on the connected page with the default kept runs the command in the default realm',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            ENTER,
            ...atConnectedPage(),
            // one Enter more: the default realm is kept
            ENTER,
            ...answerReady({ clear: true }),
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ]
        );
        expect(result.exitCode).toBe(0);
        const trees = requests().filter((r) =>
          /\/authenticationtrees\/trees(\?|$)/.test(r.url)
        );
        expect(trees).toHaveLength(1);
        // the root realm of a classic deployment, which the realm list does not hold
        expect(inRootRealm(trees[0].url)).toBe(true);
        expect(loginCount(requests())).toBe(1);
      },
      TIMEOUT
    );

    test(
      'the key hints follow the row: edit on a field, connect on Done before the login',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list', tenant],
          [
            { type: 'wait_plain', regex: 'Connection:', timeoutMs: 60000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'field' },
            ESCAPE,
            { type: 'wait_exit', timeoutMs: 15000 },
          ]
        );
        expect(navigateOf(lastPage(result.captures.field.plain))).toContain(
          '[ENTER] edit'
        );
        expect(result.exitCode).toBe(0);
      },
      TIMEOUT
    );
  });

  describe('a system with nothing to choose', () => {
    test.each([
      ['one realm', { realms: ['alpha'] }],
      ['realms that cannot be read', { realms: undefined }],
    ])(
      '%s: no Realm row, and the page concludes at once after the login',
      async (_label, options) => {
        const tenant = await startTenant(options);
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            { type: 'clear_output' },
            // ONE Enter: the next thing on the screen is the Ready step
            ENTER,
            { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 60000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'ready' },
            { type: 'clear_output' },
            ENTER,
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ]
        );
        // the page was not opened again: there was no row to show and nothing to press
        expect(result.captures.ready.plain).not.toContain(CONNECTED);
        expect(result.captures.ready.plain).not.toContain('realm:');
        expect(footerOf(lastPage(result.captures.ready.plain))).toContain(
          `journey list ${tenant} someone ********`
        );
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(
          log.filter((r) => /\/authenticationtrees\/trees(\?|$)/.test(r.url))
        ).toHaveLength(1);
      },
      TIMEOUT
    );
  });

  describe('a saved connection that needs no page', () => {
    const profiles = (tenant) => ({
      [tenant]: { tenant, alias: 'matrix', deploymentType: 'classic' },
      [OTHER_TENANT]: {
        tenant: OTHER_TENANT,
        alias: 'zion',
        deploymentType: 'classic',
      },
    });
    const withCredentials = {
      FRODO_USERNAME: 'someone',
      FRODO_PASSWORD: 'not-a-password',
    };
    const chooseHost = [
      {
        type: 'wait_plain',
        regex: 'Choose a connection profile',
        timeoutMs: 60000,
      },
      { type: 'sleep', ms: 500 },
      { type: 'send', text: 'matrix' },
      { type: 'sleep', ms: 400 },
      ENTER,
    ];

    test(
      'with several realms the page appears, already connected, with the host and the Realm row',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list'],
          [
            ...chooseHost,
            ...atConnectedPage('page'),
            ...pickRealmOnPage('bravo'),
            ENTER,
            ...answerReady({ clear: true }),
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ],
          { profiles: profiles(tenant), env: withCredentials }
        );
        const page = lastPage(result.captures.page.plain);
        // the host and the realm are on one screen; nothing asked for credentials
        expect(page).toContain('Connection:');
        expect(page).toMatch(/host: .*\(from profile matrix\)/);
        expect(page).toMatch(/realm: \/ \(default\)/);
        expect(page).not.toContain('username:');
        expect(page).not.toContain('password:');
        expect(navigateOf(page)).toContain('[ENTER] next');
        // the profile picker, then the page: no prompt of the realm of its own
        const offering = framesOf(result.plainOutput).filter((frame) =>
          frame.includes('Choose a realm')
        );
        expect(offering.every((frame) => frame.includes('Connection:'))).toBe(
          true
        );
        const log = requests();
        expect(loginCount(log)).toBe(1);
        const trees = log.filter((r) =>
          /\/authenticationtrees\/trees(\?|$)/.test(r.url)
        );
        expect(realmOf(trees[0].url)).toBe('bravo');
      },
      TIMEOUT
    );

    test(
      'with one realm no screen appears: the Ready step follows the profile picker',
      async () => {
        const tenant = await startTenant({ realms: ['alpha'] });
        const result = run(
          ['journey', 'list'],
          [
            ...chooseHost,
            { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 60000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'ready' },
            ESCAPE,
            ESCAPE,
            { type: 'wait_exit', timeoutMs: 15000 },
          ],
          { profiles: profiles(tenant), env: withCredentials }
        );
        expect(result.exitCode).toBe(0);
        expect(result.plainOutput).not.toContain('Connection:');
        expect(result.plainOutput).not.toContain(CONNECTED);
        expect(loginCount(requests())).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('a failed login', () => {
    test(
      'is shown on the page; closing it ends the command with the error and the hint, exit code 1, no second try',
      async () => {
        const tenant = await startTenant({ login: 'refuse' });
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            ENTER,
            { type: 'wait_plain', regex: 'Login failed', timeoutMs: 60000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'failure' },
            { type: 'clear_output' },
            ENTER,
            { type: 'wait_exit', timeoutMs: 30000 },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'after' },
          ]
        );
        const failure = lastPage(result.captures.failure.plain);
        expect(failure).toContain('Connection:');
        expect(failure).toMatch(/Login failed: .*Login failure/);
        expect(navigateOf(failure)).toContain('[ENTER] close');
        // the page is closed, not edited: the error and its hint follow
        expect(result.exitCode).toBe(1);
        expect(result.captures.after.plain).toContain('Error getting tokens');
        expect(result.captures.after.plain).toContain('Login failure');
        expect(result.captures.after.plain).not.toContain('Navigate');
        expect(result.captures.after.plain).not.toContain('Ready to run?');
        // one attempt: nothing logged in again
        expect(loginCount(requests())).toBe(1);
      },
      TIMEOUT
    );

    test(
      'Escape closes the failure the same way',
      async () => {
        const tenant = await startTenant({ login: 'refuse' });
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            ENTER,
            { type: 'wait_plain', regex: 'Login failed', timeoutMs: 60000 },
            { type: 'sleep', ms: 500 },
            ESCAPE,
            { type: 'wait_exit', timeoutMs: 30000 },
          ]
        );
        expect(result.exitCode).toBe(1);
        expect(loginCount(requests())).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('editing the connection after the login', () => {
    test(
      'the host is edited: the session and the realm are dropped, Done logs in again, the realm is not carried over',
      async () => {
        const first = await startTenant({}, 'first.jsonl');
        const second = await startTenant({}, 'second.jsonl');
        const result = run(
          ['journey', 'list', first],
          [
            ...toDonePage,
            ENTER,
            ...atConnectedPage('connected'),
            ...pickRealmOnPage('bravo'),
            { type: 'capture', label: 'chosen' },
            // the cursor is on Done: one more Down wraps to the host row
            DOWN,
            ENTER,
            { type: 'send', text: second },
            { type: 'clear_output' },
            ENTER,
            // the password of the old host is gone once the new host is resolved;
            // keys sent before that are ignored
            {
              type: 'wait_plain',
              regex: 'password: \\(not set\\)',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'edited' },
            // the password of the old host is gone: type it again
            DOWN,
            DOWN,
            ENTER,
            { type: 'send', text: 'not-a-password' },
            ENTER,
            { type: 'sleep', ms: 300 },
            DOWN,
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'again' },
            { type: 'clear_output' },
            ENTER,
            ...atConnectedPage('second'),
            ENTER,
            ...answerReady({ clear: true }),
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ]
        );
        const { captures } = result;
        expect(lastPage(captures.chosen.plain)).toMatch(/realm: bravo\s*│/);

        // the edit: no realm row, no status line, and Done connects again
        const edited = lastPage(captures.edited.plain);
        expect(edited).toContain(`host: ${second}`);
        expect(edited).not.toContain('realm:');
        expect(edited).not.toContain(CONNECTED);
        const again = lastPage(captures.again.plain);
        expect(navigateOf(again)).toContain('[ENTER] connect');
        expect(again).toContain('Done — log in with these values');

        // the new login shows the realm row again with the default, not bravo
        const second_ = lastPage(captures.second.plain);
        expect(second_).toMatch(/realm: \/ \(default\)/);

        // one login at each tenant, and the command ran at the second only, in its default realm
        const firstLog = requests('first.jsonl');
        const secondLog = requests('second.jsonl');
        expect(loginCount(firstLog)).toBe(1);
        expect(loginCount(secondLog)).toBe(1);
        expect(
          firstLog.some((r) => /\/authenticationtrees\/trees/.test(r.url))
        ).toBe(false);
        const trees = secondLog.filter((r) =>
          /\/authenticationtrees\/trees(\?|$)/.test(r.url)
        );
        expect(trees).toHaveLength(1);
        expect(inRootRealm(trees[0].url)).toBe(true);
        expect(secondLog.some((r) => r.url.includes('/realms/bravo/'))).toBe(
          false
        );
      },
      TIMEOUT
    );
  });

  describe('Escape', () => {
    test(
      'on the page before the login runs nothing, prints nothing and exits 0',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            { type: 'clear_output' },
            ESCAPE,
            { type: 'wait_exit', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'after' },
          ]
        );
        expect(result.exitCode).toBe(0);
        expect(replayScreen(result.captures.after.raw).join('\n')).toBe('');
        expect(loginCount(requests())).toBe(0);
      },
      TIMEOUT
    );

    test(
      'on the page after the login runs nothing, prints nothing and exits 0',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            ENTER,
            ...atConnectedPage(),
            { type: 'clear_output' },
            ESCAPE,
            { type: 'wait_exit', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'after' },
          ]
        );
        expect(result.exitCode).toBe(0);
        expect(replayScreen(result.captures.after.raw).join('\n')).toBe('');
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(
          log.some((r) => /\/authenticationtrees\/trees/.test(r.url))
        ).toBe(false);
      },
      TIMEOUT
    );

    test(
      'on the realm choices keeps the default and leaves the page open',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list', tenant],
          [
            ...toDonePage,
            ENTER,
            ...atConnectedPage(),
            UP,
            ENTER,
            { type: 'sleep', ms: 400 },
            DOWN,
            { type: 'sleep', ms: 300 },
            { type: 'clear_output' },
            ESCAPE,
            // the first Escape waits for a second one before it closes the box
            { type: 'sleep', ms: 900 },
            { type: 'capture', label: 'closed' },
            DOWN,
            { type: 'sleep', ms: 300 },
            ENTER,
            ...answerReady({ clear: true }),
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ]
        );
        const closed = lastPage(result.captures.closed.plain);
        expect(closed).toContain('Connection:');
        expect(closed).not.toContain('Choose a realm');
        expect(closed).toMatch(/realm: \/ \(default\)/);
        expect(footerOf(closed)).not.toContain('alpha');
        const trees = requests().filter((r) =>
          /\/authenticationtrees\/trees(\?|$)/.test(r.url)
        );
        expect(inRootRealm(trees[0].url)).toBe(true);
      },
      TIMEOUT
    );
  });

  describe('where no page and no login are wanted', () => {
    test(
      'a complete command line opens no page and logs in once, for the command',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list', tenant, '/', 'someone', 'not-a-password'],
          [
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ]
        );
        expect(result.plainOutput).not.toContain('Navigate');
        expect(result.plainOutput).not.toContain('Connection:');
        expect(loginCount(requests())).toBe(1);
      },
      TIMEOUT
    );

    test(
      'a realm named opens no Realm row, and the pass makes no login: Run does',
      async () => {
        const tenant = await startTenant();
        // the password is missing, so the page opens; the realm is named
        const args = ['journey', 'list', tenant, 'bravo', 'someone'];
        const cancelled = run(args, [
          { type: 'wait_plain', regex: 'Connection:', timeoutMs: 60000 },
          { type: 'sleep', ms: 500 },
          ENTER,
          { type: 'send', text: 'not-a-password' },
          ENTER,
          { type: 'sleep', ms: 300 },
          DOWN,
          { type: 'sleep', ms: 300 },
          { type: 'capture', label: 'complete' },
          ENTER,
          { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 60000 },
          { type: 'sleep', ms: 500 },
          ESCAPE,
          ESCAPE,
          { type: 'wait_exit', timeoutMs: 15000 },
        ]);
        expect(cancelled.exitCode).toBe(0);
        // Done only continues: no login on the page, no Connected line
        expect(
          navigateOf(lastPage(cancelled.captures.complete.plain))
        ).toContain('[ENTER] next');
        expect(cancelled.plainOutput).not.toContain(CONNECTED);
        expect(loginCount(requests())).toBe(0);
        expect(
          requests().some((r) => r.url.includes('/global-config/realms'))
        ).toBe(false);

        const ran = run(args, [
          { type: 'wait_plain', regex: 'Connection:', timeoutMs: 60000 },
          { type: 'sleep', ms: 500 },
          ENTER,
          { type: 'send', text: 'not-a-password' },
          ENTER,
          { type: 'sleep', ms: 300 },
          DOWN,
          ENTER,
          ...answerReady({ clear: true }),
          { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
          { type: 'sleep', ms: 500 },
        ]);
        expect(ran.exitCode).toBe(0);
        const log = requests();
        expect(loginCount(log)).toBe(1);
        // no read of the realms: nothing was to be chosen
        expect(log.some((r) => r.url.includes('/global-config/realms'))).toBe(
          false
        );
      },
      TIMEOUT
    );

    test(
      'with --no-prompt an incomplete command opens no page and logs in nowhere',
      async () => {
        const tenant = await startTenant();
        const result = run(
          ['journey', 'list', tenant, '--no-prompt'],
          [{ type: 'wait_exit', timeoutMs: 30000 }]
        );
        expect(result.exitCode).not.toBe(0);
        expect(result.plainOutput).not.toContain('Navigate');
        expect(loginCount(requests())).toBe(0);
      },
      TIMEOUT
    );
  });

  describe('a login that asks for a second factor', () => {
    test(
      'the frame of the page is gone when the question is asked, and the failure follows the code',
      async () => {
        // the default journey asks for a verification code and then fails the session lookup
        const tenant = await startFakeAm({
          recordPath,
          realms: ['alpha', 'bravo'],
        });
        tenants.push(tenant);
        const result = run(
          ['journey', 'list', `http://127.0.0.1:${tenant.port}/am`],
          [
            ...toDonePage,
            ENTER,
            {
              type: 'wait_plain',
              regex: 'Enter verification code',
              timeoutMs: 60000,
            },
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'code' },
            { type: 'send_line', text: '123456' },
            { type: 'wait_plain', regex: 'Login failed', timeoutMs: 60000 },
            { type: 'sleep', ms: 400 },
            ENTER,
            { type: 'wait_exit', timeoutMs: 30000 },
          ]
        );
        const screen = replayScreen(result.captures.code.raw).join('\n');
        // the question is on the screen, with nothing of the busy frame around it
        expect(screen).toContain('Multi-factor authentication is enabled');
        expect(screen).toContain('Enter verification code');
        expect(screen).not.toContain('Logging in');
        expect(screen).not.toContain('Connection:');
        expect(result.exitCode).toBe(1);
      },
      TIMEOUT
    );
  });
});
