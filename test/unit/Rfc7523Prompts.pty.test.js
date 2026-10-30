import cp from 'child_process';
import { generateKeyPairSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { ensureFrodoArtifact } from '../e2e/utils/FrodoBinary.cjs';
import {
  createShellTestHome,
  removeShellTestHome,
  runShellScenario,
} from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * On a terminal, the two RFC7523 commands ask for what they cannot work
 * without instead of starting and failing later (cli#1000, cli#1001), and
 * `execute` offers the users of the realm for `--sub` (cli#1004). Logins and
 * the realm go to a fake AM with a throwaway service account.
 */
const hasPty =
  process.platform !== 'win32' &&
  cp.spawnSync('python3', ['-c', 'import pty']).status === 0;
const suite = hasPty ? describe : describe.skip;

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

const issuerUrl = 'https://issuer.example.invalid';
const people = [
  {
    _id: 'u-aaa',
    userName: 'alice',
    givenName: 'Alice',
    sn: 'Smith',
    mail: 'alice@example.com',
  },
  {
    _id: 'u-bbb',
    userName: 'bob',
    givenName: 'Bob',
    sn: 'Jones',
    mail: 'bob@example.com',
  },
  {
    _id: 'u-ccc',
    userName: 'carol',
    givenName: 'Carol',
    sn: 'Smith',
    mail: 'carol.s@corp.example',
  },
];

suite('RFC7523 commands, on a real terminal', () => {
  let home;
  let recordPath;
  let fakeAm;
  let jwk;
  let jwkFile;

  beforeAll(() => {
    ensureFrodoArtifact();
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
  });

  beforeEach(() => {
    home = createShellTestHome();
    recordPath = path.join(home, 'requests.jsonl');
    jwkFile = path.join(home, 'given.jwk.json');
    fs.writeFileSync(jwkFile, jwk);
  });

  afterEach(() => {
    fakeAm?.stop();
    fakeAm = undefined;
    removeShellTestHome(home);
  });

  async function fake(options = {}) {
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'service-account',
      ...options,
    });
  }

  /** Cloud with a service account, or classic with a user name and password. */
  function onTerminal(command, args, actions, { classic = false } = {}) {
    return runShellScenario({
      homeDir: home,
      allowPrompting: true,
      env: {
        ...noCredentials,
        FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
        ...(classic
          ? { FRODO_USERNAME: 'someone', FRODO_PASSWORD: 'not-a-password' }
          : { FRODO_SA_ID: 'test-account', FRODO_SA_JWK: jwk }),
      },
      args: [
        'admin',
        command,
        `http://127.0.0.1:${fakeAm.port}/am`,
        classic ? '/' : 'alpha',
        '--type',
        classic ? 'classic' : 'cloud',
        ...args,
      ],
      actions,
    });
  }

  /** The picker as last drawn: a capture holds every frame since the last clear. */
  const lastFrame = (plain) => plain.split('┌ Navigate').pop();

  /** The URLs the fake AM was asked for. */
  const requestedUrls = () =>
    fs
      .readFileSync(recordPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).url);

  /** The subject of the assertion the flow sent for client `c1`. */
  function sentSubject() {
    const [sent] = fs
      .readFileSync(recordPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter(
        (request) => new URLSearchParams(request.body).get('client_id') === 'c1'
      );
    if (!sent) return undefined;
    const assertion = new URLSearchParams(sent.body).get('assertion');
    return JSON.parse(
      Buffer.from(assertion.split('.')[1], 'base64url').toString()
    ).sub;
  }

  test('generate asks for the issuer, then goes on', async () => {
    await fake();
    const run = onTerminal(
      'generate-rfc7523-authz-grant-artefacts',
      ['--client-id', 'c1'],
      [
        {
          type: 'wait_plain',
          regex: 'Enter a value for --iss',
          timeoutMs: 30000,
        },
        { type: 'send', text: 'https://issuer.example.invalid' },
        { type: 'key', name: 'enter' },
        {
          type: 'wait_plain',
          regex: 'Generating RFC7523 authorization grant artefacts',
          timeoutMs: 30000,
        },
      ]
    );
    expect(run.plainOutput).toContain('Enter a value for --iss');
  });

  test('execute asks for the client id, then goes on', async () => {
    await fake();
    const run = onTerminal(
      'execute-rfc7523-authz-grant-flow',
      ['--iss', issuerUrl, '--sub', 'user-1'],
      [
        {
          type: 'wait_plain',
          regex: 'Enter a value for --client-id',
          timeoutMs: 30000,
        },
        { type: 'send', text: 'c1' },
        { type: 'key', name: 'enter' },
        {
          type: 'wait_plain',
          regex: 'Executing RFC7523 authorization grant flow',
          timeoutMs: 30000,
        },
      ]
    );
    expect(run.plainOutput).toContain('Enter a value for --client-id');
  });

  describe('--sub is picked from the users', () => {
    const execute = [
      '--client-id',
      'c1',
      '--jwk-file',
      // resolved in each test: the home is made per test
    ];
    const withKey = () => [...execute, jwkFile];
    const waitForPicker = {
      type: 'wait_plain',
      regex: 'Select the user to get tokens for',
      timeoutMs: 30000,
    };
    const done = {
      type: 'wait_plain',
      regex: 'Successfully executed rfc7523 authz grant flow',
      timeoutMs: 30000,
    };

    test('shows username, first name, last name and id, and inserts the id of the pick', async () => {
      await fake({
        issuer: { issuer: issuerUrl, allowedSubjects: [] },
        users: people,
      });
      const run = onTerminal('execute-rfc7523-authz-grant-flow', withKey(), [
        waitForPicker,
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'list' },
        { type: 'key', name: 'down' },
        { type: 'key', name: 'enter' },
        done,
      ]);
      const list = lastFrame(run.captures.list.plain);
      expect(list).toMatch(/alice\s+Alice Smith\s+u-aaa/);
      expect(list).toMatch(/bob\s+Bob Jones\s+u-bbb/);
      expect(list).toMatch(/carol\s+Carol Smith\s+u-ccc/);
      expect(sentSubject()).toBe('u-bbb');
      // Identity Cloud keeps its users in IDM
      expect(
        requestedUrls().some((url) => url.includes('/openidm/managed/'))
      ).toBe(true);
      expect(
        requestedUrls().some((url) => /\/json\/.*\/users\?/.test(url))
      ).toBe(false);
    });

    test.each([
      ['username', 'carol', 'u-ccc'],
      ['first name', 'bob', 'u-bbb'],
      ['last name', 'jones', 'u-bbb'],
      ['full name', 'alice smith', 'u-aaa'],
      ['email', 'corp.example', 'u-ccc'],
      ['id', 'u-aaa', 'u-aaa'],
    ])('type to search finds a user by %s', async (_field, text, id) => {
      await fake({
        issuer: { issuer: issuerUrl, allowedSubjects: [] },
        users: people,
      });
      const run = onTerminal('execute-rfc7523-authz-grant-flow', withKey(), [
        waitForPicker,
        { type: 'sleep', ms: 400 },
        { type: 'clear_output' },
        { type: 'send', text },
        { type: 'sleep', ms: 500 },
        { type: 'capture', label: 'filtered' },
        { type: 'key', name: 'enter' },
        done,
      ]);
      const filtered = lastFrame(run.captures.filtered.plain);
      expect(filtered).toContain(id);
      // the list shows only the match
      for (const person of people.filter((person) => person._id !== id)) {
        expect(filtered).not.toContain(person._id);
      }
      expect(sentSubject()).toBe(id);
    });

    test('with several allowed subjects only those are offered', async () => {
      await fake({
        issuer: { issuer: issuerUrl, allowedSubjects: ['u-aaa', 'u-ccc'] },
        users: people,
      });
      const run = onTerminal('execute-rfc7523-authz-grant-flow', withKey(), [
        waitForPicker,
        { type: 'sleep', ms: 400 },
        { type: 'capture', label: 'list' },
        { type: 'key', name: 'down' },
        { type: 'key', name: 'enter' },
        done,
      ]);
      const list = lastFrame(run.captures.list.plain);
      expect(list).toContain('u-aaa');
      expect(list).toContain('u-ccc');
      expect(list).not.toContain('u-bbb');
      expect(sentSubject()).toBe('u-ccc');
    });

    test('with one allowed subject there is nothing to pick', async () => {
      await fake({
        issuer: { issuer: issuerUrl, allowedSubjects: ['u-bbb'] },
        users: people,
      });
      const run = onTerminal('execute-rfc7523-authz-grant-flow', withKey(), [
        done,
      ]);
      expect(run.plainOutput).not.toContain('Select the user');
      expect(sentSubject()).toBe('u-bbb');
    });

    test('--sub given is not asked for', async () => {
      await fake({
        issuer: { issuer: issuerUrl, allowedSubjects: [] },
        users: people,
      });
      const run = onTerminal(
        'execute-rfc7523-authz-grant-flow',
        [...withKey(), '--sub', 'u-given'],
        [done]
      );
      expect(run.plainOutput).not.toContain('Select the user');
      expect(sentSubject()).toBe('u-given');
    });

    test('Esc declines the pick and sends nothing', async () => {
      await fake({
        issuer: { issuer: issuerUrl, allowedSubjects: [] },
        users: people,
      });
      onTerminal('execute-rfc7523-authz-grant-flow', withKey(), [
        waitForPicker,
        { type: 'key', name: 'escape' },
        { type: 'sleep', ms: 1500 },
      ]);
      expect(sentSubject()).toBeUndefined();
    });

    describe('on a classic deployment (the AM users endpoint, no IDM)', () => {
      // a classic login has no token endpoint in the fake: the flow's own
      // request is the last thing that happens, and it is what is checked
      const requested = {
        type: 'wait_request',
        path: undefined,
        regex: '/access_token',
        timeoutMs: 30000,
      };
      const classic = { classic: true };
      const sent = () => ({ ...requested, path: recordPath });

      test('lists the realm users with their names and inserts the id of the pick', async () => {
        await fake({
          journey: 'password',
          issuer: { issuer: issuerUrl, allowedSubjects: [] },
          users: people,
        });
        const run = onTerminal(
          'execute-rfc7523-authz-grant-flow',
          withKey(),
          [
            waitForPicker,
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'list' },
            { type: 'key', name: 'down' },
            { type: 'key', name: 'enter' },
            sent(),
          ],
          classic
        );
        const list = lastFrame(run.captures.list.plain);
        expect(list).toMatch(/alice\s+Alice Smith\s+u-aaa/);
        expect(list).toMatch(/bob\s+Bob Jones\s+u-bbb/);
        expect(sentSubject()).toBe('u-bbb');
        // a classic deployment has no IDM: the users come from the AM endpoint
        expect(
          requestedUrls().some((url) => /\/json\/.*\/users\?/.test(url))
        ).toBe(true);
        expect(requestedUrls().some((url) => url.includes('/openidm/'))).toBe(
          false
        );
      });

      test.each([
        ['username', 'carol', 'u-ccc'],
        ['last name', 'jones', 'u-bbb'],
        ['email', 'corp.example', 'u-ccc'],
      ])('type to search finds a user by %s', async (_field, text, id) => {
        await fake({
          journey: 'password',
          issuer: { issuer: issuerUrl, allowedSubjects: [] },
          users: people,
        });
        onTerminal(
          'execute-rfc7523-authz-grant-flow',
          withKey(),
          [
            waitForPicker,
            { type: 'sleep', ms: 400 },
            { type: 'send', text },
            { type: 'sleep', ms: 500 },
            { type: 'key', name: 'enter' },
            sent(),
          ],
          classic
        );
        expect(sentSubject()).toBe(id);
      });

      test('with several allowed subjects only those are offered', async () => {
        await fake({
          journey: 'password',
          issuer: { issuer: issuerUrl, allowedSubjects: ['u-aaa', 'u-ccc'] },
          users: people,
        });
        const run = onTerminal(
          'execute-rfc7523-authz-grant-flow',
          withKey(),
          [
            waitForPicker,
            { type: 'sleep', ms: 400 },
            { type: 'capture', label: 'list' },
            { type: 'key', name: 'enter' },
            sent(),
          ],
          classic
        );
        const list = lastFrame(run.captures.list.plain);
        expect(list).toContain('u-aaa');
        expect(list).toContain('u-ccc');
        expect(list).not.toContain('u-bbb');
        expect(sentSubject()).toBe('u-aaa');
      });

      test('a big realm asks for a search text first', async () => {
        const crowd = Array.from({ length: 1001 }, (_, index) => {
          const n = String(index).padStart(4, '0');
          return {
            _id: `id-${n}`,
            userName: `user${n}`,
            givenName: 'First',
            sn: `Last${n}`,
            mail: `user${n}@example.com`,
          };
        });
        await fake({
          journey: 'password',
          issuer: { issuer: issuerUrl, allowedSubjects: [] },
          users: crowd,
        });
        onTerminal(
          'execute-rfc7523-authz-grant-flow',
          withKey(),
          [
            {
              type: 'wait_plain',
              regex: 'The realm has more than 1000 users',
              timeoutMs: 30000,
            },
            { type: 'send', text: 'user004' },
            { type: 'key', name: 'enter' },
            waitForPicker,
            { type: 'sleep', ms: 400 },
            { type: 'key', name: 'down' },
            { type: 'key', name: 'enter' },
            sent(),
          ],
          classic
        );
        expect(sentSubject()).toBe('id-0041');
      });
    });

    describe('in a realm with more than 1000 users', () => {
      const crowd = Array.from({ length: 1001 }, (_, index) => {
        const n = String(index).padStart(4, '0');
        return {
          _id: `id-${n}`,
          userName: `user${n}`,
          givenName: 'First',
          sn: `Last${n}`,
          mail: `user${n}@example.com`,
        };
      });

      test('asks for a search text first, asks again when too many match, then lists the matches', async () => {
        await fake({
          issuer: { issuer: issuerUrl, allowedSubjects: [] },
          users: crowd,
        });
        const run = onTerminal('execute-rfc7523-authz-grant-flow', withKey(), [
          {
            type: 'wait_plain',
            regex: 'The realm has more than 1000 users',
            timeoutMs: 30000,
          },
          { type: 'send', text: 'user' },
          { type: 'key', name: 'enter' },
          {
            type: 'wait_plain',
            regex: "1001 users match 'user'",
            timeoutMs: 30000,
          },
          { type: 'clear_output' },
          { type: 'send', text: 'user004' },
          { type: 'key', name: 'enter' },
          waitForPicker,
          { type: 'sleep', ms: 400 },
          { type: 'capture', label: 'matches' },
          { type: 'key', name: 'down' },
          { type: 'key', name: 'enter' },
          done,
        ]);
        const matches = lastFrame(run.captures.matches.plain);
        expect(matches).toContain('id-0040');
        expect(matches).toContain('id-0049');
        expect(matches).not.toContain('id-0050');
        expect(sentSubject()).toBe('id-0041');
      });

      test('Esc at the search text declines and sends nothing', async () => {
        await fake({
          issuer: { issuer: issuerUrl, allowedSubjects: [] },
          users: crowd,
        });
        onTerminal('execute-rfc7523-authz-grant-flow', withKey(), [
          {
            type: 'wait_plain',
            regex: 'The realm has more than 1000 users',
            timeoutMs: 30000,
          },
          { type: 'key', name: 'escape' },
          { type: 'sleep', ms: 1500 },
        ]);
        expect(sentSubject()).toBeUndefined();
      });
    });
  });
});
