import cp from 'child_process';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  firstLoginIndex,
  firstRequestIndex,
  loginCount,
  readRequests,
} from '../utils/FakeAmLog.js';
import { answerReady } from '../utils/ReadyStep.js';
import { replayScreen } from '../utils/ScreenReplay.js';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * Decision records 0044 and 0046, on a real terminal against a fake tenant: the
 * pass logs in when a realm picker or an entity picker needs it, the pickers run
 * in the pass, and the Ready step is the LAST prompt. The realm is a row of the
 * connection page, which opens (already connected) after the host was chosen
 * from the saved connections. The request log of the fake
 * tenant is the proof of what happened when: a login is the authenticate call
 * that starts a journey (see test/utils/FakeAmLog.js).
 *
 * The tenant has two realms and two journeys, and the command line leaves the
 * host to a picker of two saved connections, which is what makes the realm
 * picker open (record 0001).
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

const TIMEOUT = 240000;
const OTHER_TENANT = 'https://zion.example.com/am';
const THIRD_TENANT = 'https://trinity.example.com/am';
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

const lastFrame = (plain) => plain.split('┌ Navigate').pop();
const navigate = (frame) => frame.split('└')[0];
const footer = (frame) => frame.split('└').pop();
const at = (text, needle) => {
  const index = text.indexOf(needle);
  expect(index).toBeGreaterThan(-1);
  return index;
};

suite('the login in the resolution pass, on a real terminal', () => {
  let home;
  let recordPath;
  let fakeAm;

  beforeAll(() => {
    ensureFrodoArtifact();
  });

  /** A fake tenant that records its requests; `options` change how it behaves. */
  async function startTenant(options = {}) {
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      realms: ['alpha', 'bravo'],
      trees: ['zion-login', 'matrix-login'],
      ...options,
    });
    return `http://127.0.0.1:${fakeAm.port}/am`;
  }

  beforeEach(() => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  /**
   * Runs frodo with two saved connections (the tenant, alias matrix, and another,
   * alias zion); `withThird` saves a third (alias trinity).
   */
  function run(tenant, args, actions, env = {}, { withThird = false } = {}) {
    const profiles = path.join(home, 'Connections.json');
    fs.writeFileSync(
      profiles,
      JSON.stringify({
        [tenant]: { tenant, alias: 'matrix', deploymentType: 'classic' },
        [OTHER_TENANT]: {
          tenant: OTHER_TENANT,
          alias: 'zion',
          deploymentType: 'classic',
        },
        ...(withThird
          ? {
              [THIRD_TENANT]: {
                tenant: THIRD_TENANT,
                alias: 'trinity',
                deploymentType: 'classic',
              },
            }
          : {}),
      })
    );
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: profiles,
        ...env,
      },
      args,
      actions,
    });
  }

  const requests = () => readRequests(recordPath);

  // -- the steps of a flow --------------------------------------------------

  /** The container's picker: choose a sub-command by typing its name. */
  const chooseSubCommand = (name) => [
    { type: 'wait_plain', regex: 'Navigate', timeoutMs: 30000 },
    { type: 'sleep', ms: 500 },
    { type: 'send', text: name },
    { type: 'sleep', ms: 400 },
    { type: 'key', name: 'enter' },
  ];

  /** The host picker: the saved connection with the alias matrix. */
  const chooseHost = [
    {
      type: 'wait_plain',
      regex: 'Choose a connection profile',
      timeoutMs: 30000,
    },
    { type: 'sleep', ms: 500 },
    { type: 'send', text: 'matrix' },
    { type: 'sleep', ms: 400 },
    { type: 'capture', label: 'host' },
    { type: 'key', name: 'enter' },
  ];

  /**
   * The connection page with the realm row (the pass logged in for it), choosing
   * bravo in the box of the realms and going on with Done.
   */
  const chooseRealm = [
    { type: 'wait_plain', regex: 'Connected as', timeoutMs: 30000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label: 'realm' },
    // the cursor is on Done: up to the realm row, Enter opens the realms
    { type: 'key', name: 'up' },
    { type: 'key', name: 'enter' },
    { type: 'wait_plain', regex: 'Choose a realm', timeoutMs: 30000 },
    { type: 'sleep', ms: 400 },
    { type: 'send', text: 'bravo' },
    { type: 'sleep', ms: 400 },
    { type: 'key', name: 'enter' },
    { type: 'sleep', ms: 300 },
    { type: 'key', name: 'down' },
    { type: 'key', name: 'enter' },
  ];

  /** The one-of group of `journey export`, choosing -i. */
  const chooseJourneyOption = [
    { type: 'wait_plain', regex: 'Choose what to export', timeoutMs: 30000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label: 'oneOf' },
    { type: 'send', text: 'journey-id' },
    { type: 'sleep', ms: 400 },
    { type: 'key', name: 'enter' },
  ];

  /** The journey picker, choosing the first row. */
  const chooseJourney = [
    { type: 'wait_plain', regex: 'Select journey to act on', timeoutMs: 30000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label: 'journey' },
    { type: 'key', name: 'enter' },
  ];

  /** The Ready step, captured. */
  const atReady = [
    { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
    { type: 'sleep', ms: 500 },
    { type: 'capture', label: 'ready' },
  ];

  /** `frodo journey` -> export -> host -> realm -> -i -> journey, up to the Ready step. */
  const toReady = [
    ...chooseSubCommand('export'),
    ...chooseHost,
    ...chooseRealm,
    ...chooseJourneyOption,
    ...chooseJourney,
    ...atReady,
  ];

  describe('the acceptance flow: frodo journey, export, a saved connection, a realm, a journey', () => {
    test(
      'logs in once the host is chosen, asks the pickers, and the Ready step is the last prompt',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey'],
          [
            ...toReady,
            { type: 'clear_output' },
            { type: 'key', name: 'enter' },
            // the command runs; nothing prompts after Run
            { type: 'sleep', ms: 4000 },
            { type: 'capture', label: 'after' },
          ]
        );

        // the prompts come in this order, and the Ready step is the last of them
        // (the capture at the step holds everything shown until then)
        const order = [
          'Choose a connection profile',
          'Choose a realm',
          'Choose what to export',
          'Select journey to act on',
          'Ready to run?',
        ].map((prompt) => at(result.captures.ready.plain, prompt));
        expect(order).toEqual([...order].sort((a, b) => a - b));

        // nothing prompts after Run: no frame is drawn once Enter ran the command
        expect(result.captures.after.plain).not.toContain('Navigate');
        expect(result.captures.after.plain).not.toContain('Select journey');
        expect(result.captures.after.plain).not.toContain('Choose a realm');
        // the command ran for the journey and the realm that were picked
        expect(result.captures.after.plain).toContain('matrix-login');

        // the pickers say next, the step says run
        expect(navigate(lastFrame(result.captures.realm.plain))).toContain(
          '[ENTER] next'
        );
        expect(navigate(lastFrame(result.captures.journey.plain))).toContain(
          '[ENTER] next'
        );
        expect(navigate(lastFrame(result.captures.ready.plain))).toContain(
          '[ENTER] run'
        );
        // the step shows the command with the realm and the journey picked
        const command = footer(lastFrame(result.captures.ready.plain));
        expect(command).toContain('journey export');
        expect(command).toContain('bravo');
        expect(command).toContain('--journey-id matrix-login');

        // one login, made before the realms were read, and before the journeys were listed
        const log = requests();
        expect(loginCount(log)).toBe(1);
        const realms = firstRequestIndex(log, '/global-config/realms');
        const journeys = firstRequestIndex(log, '/authenticationtrees/trees');
        expect(firstLoginIndex(log)).toBeGreaterThan(-1);
        expect(firstLoginIndex(log)).toBeLessThan(realms);
        expect(realms).toBeLessThan(journeys);
        // each list was read once, in the realm that was picked
        expect(
          log.filter((r) => r.url.includes('/global-config/realms'))
        ).toHaveLength(1);
        expect(
          log.filter((r) => /\/authenticationtrees\/trees(\?|$)/.test(r.url))
        ).toHaveLength(1);
        expect(log.some((r) => r.url.includes('/realms/bravo/'))).toBe(true);
      },
      TIMEOUT
    );

    test(
      'Escape on the Ready step after the login runs nothing, prints nothing and exits 0',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey'],
          [
            ...toReady,
            { type: 'clear_output' },
            { type: 'key', name: 'escape' },
            { type: 'key', name: 'escape' },
            { type: 'wait_exit', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
            { type: 'capture', label: 'after' },
          ]
        );
        expect(result.exitCode).toBe(0);
        // nothing is left on the screen: no frame, no printed command, no result
        expect(replayScreen(result.captures.after.raw).join('\n')).toBe('');
        const log = requests();
        // the pass logged in and read the lists for its pickers; the command never read the journey
        expect(loginCount(log)).toBe(1);
        expect(log.some((r) => r.url.includes('/trees/matrix-login'))).toBe(
          false
        );
      },
      TIMEOUT
    );
  });

  describe('the login of the pass is the one the command uses', () => {
    /** `journey export` with the host given as an alias, the realm named, and the journey picked. */
    const exportByAlias = (extra = []) => [
      'journey',
      'export',
      'matrix',
      '/',
      '--type',
      'classic',
      ...extra,
    ];
    const pickJourney = [
      ...chooseJourneyOption,
      ...chooseJourney,
      ...atReady,
      { type: 'key', name: 'enter' },
      { type: 'sleep', ms: 4000 },
    ];

    test(
      'an alias given for the host still reaches the tenant after the pass logged in: the action does not write it into the state again',
      async () => {
        const tenant = await startTenant();
        const result = run(tenant, exportByAlias(), pickJourney);
        // one login, and the command's own request for the journey went to the tenant
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(log.some((r) => r.url.includes('/trees/matrix-login'))).toBe(
          true
        );
        expect(result.plainOutput).not.toContain('Invalid URL');
      },
      TIMEOUT
    );

    test(
      'a forced user login (the global option) is the login of the pass and of the command: one login',
      async () => {
        const tenant = await startTenant();
        run(tenant, exportByAlias(['--force-login-as-user']), pickJourney);
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(log.some((r) => r.url.includes('/trees/matrix-login'))).toBe(
          true
        );
      },
      TIMEOUT
    );
  });

  describe('a pick that is declined, and a pick that needs no login', () => {
    test(
      'Escape on the journey picker ends the command with exit code 1: it runs nothing and asks nothing more',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey', 'export'],
          [
            ...chooseHost,
            ...chooseRealm,
            ...chooseJourneyOption,
            {
              type: 'wait_plain',
              regex: 'Select journey to act on',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'clear_output' },
            { type: 'key', name: 'escape' },
            { type: 'wait_exit', timeoutMs: 15000 },
            { type: 'sleep', ms: 300 },
          ]
        );
        expect(result.exitCode).toBe(1);
        expect(result.plainOutput).not.toContain('Ready to run?');
        expect(
          requests().some((r) => r.url.includes('/trees/matrix-login'))
        ).toBe(false);
      },
      TIMEOUT
    );

    test(
      'the receiving tenant of a remote proxy is picked from the saved profiles in the pass, without a login',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['idm', 'remote-proxy', 'setup', tenant],
          [
            {
              type: 'wait_plain',
              regex: 'Select the receiving tenant',
              timeoutMs: 30000,
            },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'target' },
            { type: 'key', name: 'enter' },
            ...atReady,
            { type: 'key', name: 'escape' },
            { type: 'key', name: 'escape' },
            { type: 'wait_exit', timeoutMs: 15000 },
          ],
          {},
          { withThird: true }
        );
        const picker = lastFrame(result.captures.target.plain);
        // the other saved connections, not the one the command is logged in to
        expect(picker).toContain('zion.example.com');
        expect(picker).toContain('trinity.example.com');
        // (the rows are the second box; the footer names the host of the command)
        expect(picker.split('└')[1]).not.toContain(tenant);
        expect(navigate(picker)).toContain('[ENTER] next');
        expect(footer(lastFrame(result.captures.ready.plain))).toContain(
          '--target'
        );
        expect(result.exitCode).toBe(0);
        // the loader reads this machine: the pass made no login
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('a tenant of a deployment type the command does not support', () => {
    // `esv secret describe` is cloud-only and asks for a secret, a pick that needs the
    // login; the fake tenant is a classic deployment
    const refusal = "Unsupported deployment type 'classic'";

    test(
      'is refused with the library error before any picker, exit code 1, in the words of a command line that is complete',
      async () => {
        const tenant = await startTenant();
        const asked = run(
          tenant,
          ['esv', 'secret', 'describe', tenant],
          [
            { type: 'wait_exit', timeoutMs: 30000 },
            { type: 'sleep', ms: 300 },
          ]
        );
        expect(asked.exitCode).toBe(1);
        expect(asked.plainOutput).toContain('Error getting tokens');
        expect(asked.plainOutput).toContain(refusal);
        expect(asked.plainOutput).not.toContain('Select secret to act on');
        expect(asked.plainOutput).not.toContain('Ready to run?');
        expect(asked.plainOutput).not.toContain('Error reading');
        // one login attempt, and nothing was read from the tenant for a picker
        const log = requests();
        expect(loginCount(log)).toBeLessThanOrEqual(1);
        expect(firstRequestIndex(log, '/esv/')).toBe(-1);

        // the same refusal, word for word, as the login of a command line that is complete
        const given = run(
          tenant,
          ['esv', 'secret', 'describe', tenant, '-i', 'a-secret'],
          [
            { type: 'wait_exit', timeoutMs: 30000 },
            { type: 'sleep', ms: 300 },
          ]
        );
        expect(given.exitCode).toBe(1);
        const words = (output) =>
          output.split('Error getting tokens').pop().trim();
        expect(words(asked.plainOutput)).toBe(words(given.plainOutput));
      },
      TIMEOUT
    );

    test(
      'a command that supports the type goes on to its picker',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey', 'export', tenant, '/alpha'],
          [
            ...chooseJourneyOption,
            ...chooseJourney,
            ...atReady,
            { type: 'key', name: 'enter' },
            { type: 'sleep', ms: 3000 },
          ]
        );
        expect(result.captures.journey.plain).toContain('matrix-login');
        expect(result.plainOutput).not.toContain(refusal);
      },
      TIMEOUT
    );
  });

  describe('a command that needs no picker', () => {
    // FRODO_REALM names the realm, so the realm picker does not open
    const named = { FRODO_REALM: 'alpha' };

    test(
      'asks the Ready step first and logs in after Run',
      async () => {
        const tenant = await startTenant();
        const cancelled = run(
          tenant,
          ['journey', 'list'],
          [
            ...chooseHost,
            ...atReady,
            // a second Escape cancels at once
            { type: 'key', name: 'escape' },
            { type: 'key', name: 'escape' },
            { type: 'wait_exit', timeoutMs: 15000 },
          ],
          named
        );
        expect(cancelled.exitCode).toBe(0);
        expect(cancelled.captures.ready.plain).toContain('Ready to run?');
        // no login happened before the step: nothing was requested at all
        expect(requests()).toEqual([]);

        const ran = run(
          tenant,
          ['journey', 'list'],
          [
            ...chooseHost,
            ...atReady,
            { type: 'clear_output' },
            { type: 'key', name: 'enter' },
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ],
          named
        );
        expect(ran.plainOutput).not.toContain('Choose a realm');
        // the lists are read after the login, which Run started
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(firstLoginIndex(log)).toBeLessThan(
          firstRequestIndex(log, '/authenticationtrees/trees')
        );
        expect(firstRequestIndex(log, '/global-config/realms')).toBe(-1);
      },
      TIMEOUT
    );
  });

  describe('a failed login in the pass', () => {
    test(
      'ends the command with the error and the hint, exit code 1, no Ready step and no second try',
      async () => {
        const tenant = await startTenant({ login: 'refuse' });
        const result = run(
          tenant,
          ['journey', 'list'],
          [
            ...chooseHost,
            { type: 'wait_exit', timeoutMs: 30000 },
            { type: 'sleep', ms: 300 },
          ]
        );
        expect(result.exitCode).toBe(1);
        expect(result.plainOutput).toContain('Error getting tokens');
        expect(result.plainOutput).toContain('Login failure');
        expect(result.plainOutput).not.toContain('Choose a realm');
        expect(result.plainOutput).not.toContain('Ready to run?');
        // one attempt: the command never started, so it did not log in again
        expect(loginCount(requests())).toBe(1);
      },
      TIMEOUT
    );
  });

  describe('a command line that is complete', () => {
    test(
      'is not asked anything and logs in once, for the command itself',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey', 'list', tenant, '/alpha'],
          [
            { type: 'wait_plain', regex: 'matrix-login', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
          ]
        );
        expect(result.plainOutput).not.toContain('Ready to run?');
        expect(result.plainOutput).not.toContain('Navigate');
        // one login, then the command's own request; no realm picker, so no read of the realms
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(firstLoginIndex(log)).toBeLessThan(
          firstRequestIndex(log, '/authenticationtrees/trees')
        );
        expect(firstRequestIndex(log, '/global-config/realms')).toBe(-1);
      },
      TIMEOUT
    );

    test(
      'with --no-prompt an incomplete command fails before any login',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey', 'export', tenant, '/alpha', '--no-prompt'],
          [{ type: 'wait_exit', timeoutMs: 30000 }]
        );
        expect(result.exitCode).not.toBe(0);
        expect(result.plainOutput).not.toContain('Navigate');
        expect(requests()).toEqual([]);
      },
      TIMEOUT
    );
  });

  describe('Edit options on the Ready step', () => {
    /** Ready -> Edit options -> mark one option -> commit -> back. */
    const editOption = (filter) => [
      { type: 'key', name: 'down' },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
      { type: 'wait_plain', regex: 'Optional options for', timeoutMs: 30000 },
      { type: 'sleep', ms: 500 },
      { type: 'send', text: filter },
      { type: 'sleep', ms: 400 },
      { type: 'key', name: 'space' },
      { type: 'sleep', ms: 300 },
      { type: 'clear_output' },
      { type: 'key', name: 'enter' },
    ];

    test(
      'keeps the login and the picks when an option that has nothing to do with the connection is set',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey', 'export'],
          [
            ...chooseHost,
            ...chooseRealm,
            ...chooseJourneyOption,
            ...chooseJourney,
            ...atReady,
            ...editOption('verbose'),
            { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'again' },
          ]
        );
        expect(footer(lastFrame(result.captures.again.plain))).toContain(
          '--verbose'
        );
        expect(result.plainOutput).not.toContain('Select journey to act on');
        const log = requests();
        expect(loginCount(log)).toBe(1);
        expect(
          log.filter((r) => r.url.includes('/global-config/realms'))
        ).toHaveLength(1);
      },
      TIMEOUT
    );

    test(
      'logs in again and asks the realm again when an option of the Connection group is set',
      async () => {
        const tenant = await startTenant();
        const result = run(
          tenant,
          ['journey', 'export'],
          [
            ...chooseHost,
            ...chooseRealm,
            ...chooseJourneyOption,
            ...chooseJourney,
            ...atReady,
            ...editOption('insecure'),
            // the connection changed: the realm is asked again, after a new login,
            // on the page (Done keeps the default)
            { type: 'wait_plain', regex: 'Connected as', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
            { type: 'clear_output' },
            { type: 'key', name: 'enter' },
            { type: 'wait_plain', regex: 'Ready to run\\?', timeoutMs: 30000 },
            { type: 'sleep', ms: 500 },
            { type: 'capture', label: 'again' },
          ]
        );
        // the footer prints the short flag
        expect(footer(lastFrame(result.captures.again.plain))).toMatch(/ -k\b/);
        // the journey that was picked is kept, not asked again
        expect(result.captures.again.plain).not.toContain(
          'Select journey to act on'
        );
        expect(footer(lastFrame(result.captures.again.plain))).toContain(
          '--journey-id matrix-login'
        );
        expect(loginCount(requests())).toBe(2);
      },
      TIMEOUT
    );
  });
});
