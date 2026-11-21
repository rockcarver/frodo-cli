/**
 * The text of a tool result of the MCP server, with the known values redacted.
 *
 * The real server process (`frodo mcp server start`, stdio) runs against the
 * fake AM of test/utils/FakeAm.mjs. The login hands out chosen values (the
 * access value of a service account, the session value of a user), so that the
 * test can search every character that the client receives for them. A call
 * whose requests fail returns what failed; the text has to say what failed
 * (which journey, which node, the status of the answer) and must hold neither
 * the chosen values nor the header lines of the requests that failed.
 */
import { generateKeyPairSync } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { startFakeAm } from '../../utils/StartFakeAm.js';

const cliPath = path.resolve('dist/launch.cjs');
const VALUE_A = 'MARKER-A-000000001';
const VALUE_B = 'MARKER-B-000000001';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccountJwk = JSON.stringify(privateKey.export({ format: 'jwk' }));

let testDirectory;
let fakeAm;
let client;

beforeEach(() => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-mcp-text-'));
});

afterEach(async () => {
  await client?.close();
  client = undefined;
  fakeAm?.stop();
  fakeAm = undefined;
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

/** Starts the server against the fake AM and answers a connected client. */
async function startServer(
  extraArguments,
  environment = {},
  profile = 'authentication',
  hostUserInfo = ''
) {
  const connected = new Client(
    { name: 'frodo-cli-test', version: '1.0.0' },
    { supportedProtocolVersions: ['2025-11-25'] }
  );
  const env = {
    ...process.env,
    FRODO_TEST: '0',
    NO_COLOR: '1',
    FRODO_NO_CACHE: 'true',
    FRODO_TOKEN_CACHE_PATH: path.join(testDirectory, 'TokenCache.json'),
    FRODO_MASTER_KEY_PATH: path.join(testDirectory, 'masterkey.key'),
    FRODO_CONNECTION_PROFILES_PATH: path.join(
      testDirectory,
      'Connections.json'
    ),
    ...environment,
  };
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      cliPath,
      'mcp',
      'server',
      'start',
      `http://${hostUserInfo ? `${hostUserInfo}@` : ''}127.0.0.1:${fakeAm.port}/am`,
      ...extraArguments,
      '--policy',
      'admin',
      '--profile',
      profile,
    ],
    env,
    cwd: testDirectory,
    stderr: 'pipe',
  });
  await connected.connect(transport);
  client = connected;
  return connected;
}

/** Every character of a tool result, as the client receives it. */
function textOf(result) {
  return result.content.map((part) => part.text ?? '').join('\n');
}

/** A call that makes requests of its own and returns the errors of those that failed. */
function callWithFailingRequests(connected, journeyId) {
  return connected.callTool({
    name: 'frodo_dispatch',
    arguments: {
      skillId: 'authn.journey.deleteJourney',
      namedArgs: {
        journeyId,
        options: { deep: true, verbose: false, progress: false },
      },
    },
  });
}

const SERVICE_ACCOUNT = {
  arguments: ['--type', 'cloud'],
  environment: { FRODO_SA_ID: 'test-account', FRODO_SA_JWK: serviceAccountJwk },
};

describe('the text of a tool result whose requests failed', () => {
  test('requests of a node fail, logged in with a service account', async () => {
    fakeAm = await startFakeAm({
      journey: 'service-account',
      accessToken: VALUE_A,
      journeys: { j1: { n1: 'ScriptedDecisionNode' } },
      failRequests: [{ method: 'DELETE', path: '/authenticationtrees/nodes/' }],
    });
    const connected = await startServer(
      SERVICE_ACCOUNT.arguments,
      SERVICE_ACCOUNT.environment
    );

    const text = textOf(await callWithFailingRequests(connected, 'j1'));

    // it says what failed
    expect(text).toContain('n1');
    expect(text).toContain('fake tenant operation failed');
    expect(text).toContain('/authenticationtrees/nodes/ScriptedDecisionNode');
    // and the known values are redacted
    expect(text).not.toContain(VALUE_A);
    expect(text).not.toMatch(/Bearer\s+MARKER/);
    expect(text).toContain('Bearer <redacted>');
  }, 90000);

  test('the first request fails, logged in with a service account', async () => {
    fakeAm = await startFakeAm({
      journey: 'service-account',
      accessToken: VALUE_A,
      journeys: { j1: { n1: 'ScriptedDecisionNode' } },
      failRequests: [{ method: 'DELETE', path: '/authenticationtrees/trees/' }],
    });
    const connected = await startServer(
      SERVICE_ACCOUNT.arguments,
      SERVICE_ACCOUNT.environment
    );

    const text = textOf(await callWithFailingRequests(connected, 'j1'));

    expect(text).toContain('Request failed with status code 500');
    expect(text).toContain('/authenticationtrees/trees/j1');
    expect(text).not.toContain(VALUE_A);
    expect(text).not.toMatch(/Bearer\s+MARKER/);
  }, 90000);

  test('requests of a node fail, logged in with a user name and password', async () => {
    fakeAm = await startFakeAm({
      journey: 'password',
      sessionToken: VALUE_B,
      sessionTtlSeconds: 3600,
      journeys: { j1: { n1: 'ScriptedDecisionNode' } },
      failRequests: [{ method: 'DELETE', path: '/authenticationtrees/nodes/' }],
    });
    const connected = await startServer([
      'admin',
      'Passw0rd!',
      '--type',
      'classic',
    ]);

    const text = textOf(await callWithFailingRequests(connected, 'j1'));

    expect(text).toContain('n1');
    expect(text).toContain('fake tenant operation failed');
    expect(text).not.toContain(VALUE_B);
  }, 90000);
});

describe('the text of a tool result whose failing request is answered with a long text', () => {
  const PAD = '@PADDING@';
  // the login passwords of the cases: 15, 13 and 14 characters; the first holds a quote, a backslash and a
  // plus sign, the third a quote, a brace and a plus sign; the first and the third are checked in three parts
  const PASSWORDS = [
    [
      'a quote, a backslash and a plus sign',
      'ZQX"qzv\\+WXY987',
      ['ZQX', 'qzv', 'WXY987'],
    ],
    ['letters and digits', 'ZQXecho987654', ['ZQXecho987654']],
    [
      'a quote, a brace and a plus sign',
      'ZQX{"qzv\\+WXY9',
      ['ZQX', 'qzv', 'WXY9'],
    ],
  ];
  const callback = (input) =>
    `{"callbacks":[{"type":"PasswordCallback","input":[${input}]}],"padding":"${PAD}"}`;
  /** The texts that the fake tenant answers with: JSON texts, some of them inside other texts, with a password in them. */
  const formsOf = (password) => {
    const value = JSON.stringify(password);
    return [
      [
        'the value before the name',
        callback(`{"value":${value},"name":"IDToken2"}`),
      ],
      [
        'three levels of JSON text',
        JSON.stringify({
          wrapped: JSON.stringify({
            inner: JSON.stringify({ password }),
          }),
          padding: PAD,
        }),
      ],
      [
        'a password key in two texts',
        JSON.stringify({
          wrapped: JSON.stringify({
            text: JSON.stringify({ password }),
          }),
          padding: PAD,
        }),
      ],
      [
        'a key with a unicode escape',
        `{"\\u0070assword":${value},"padding":"${PAD}"}`,
      ],
      [
        'a callback name with a unicode escape',
        callback(`{"name":"IDToken\\u0032","value":${value}}`),
      ],
      [
        'an attribute between the name and the value',
        callback(`{"name":"IDToken2","note":1,"value":${value}}`),
      ],
      [
        'an authorization value',
        JSON.stringify({ headers: { Authorization: password }, padding: PAD }),
      ],
    ];
  };

  const CASES = PASSWORDS.flatMap(([kind, password, parts], index) => {
    const forms = formsOf(password);
    // the password with special characters in every form and at two sizes of two forms, the other in two forms
    return [
      ...(index === 0 ? forms : forms.slice(0, 2)).map(([name, text]) => [
        kind,
        name,
        70000,
        password,
        parts,
        text,
      ]),
      ...(index === 0 ? forms.slice(0, 2) : []).map(([name, text]) => [
        kind,
        name,
        1000000,
        password,
        parts,
        text,
      ]),
      // a text of a few KiB that is not valid JSON (two closing braces after it)
      ...(index === 0 ? [forms[1], forms[3]] : []).flatMap(([name, text]) =>
        [2000, 30000].map((padding) => [
          kind,
          `${name}, not valid JSON`,
          padding,
          password,
          parts,
          `${text}}}`,
        ])
      ),
    ];
  });

  test.each(CASES)(
    'a login password with %s, %s, in a text with %s characters of padding: no part of it is in the result',
    async (_kind, _name, padding, password, parts, text) => {
      fakeAm = await startFakeAm({
        journey: 'password',
        sessionToken: VALUE_B,
        sessionTtlSeconds: 3600,
        journeys: { j1: { n1: 'ScriptedDecisionNode' } },
        failRequests: [
          {
            method: 'DELETE',
            path: '/authenticationtrees/nodes/',
            echo: { text, padding },
          },
        ],
      });
      const connected = await startServer([
        'admin',
        password,
        '--type',
        'classic',
      ]);

      const result = await callWithFailingRequests(connected, 'j1');
      const answer = textOf(result);

      expect(answer).toContain('fake tenant operation failed');
      for (const part of parts) expect(answer).not.toContain(part);
    },
    120000
  );
});

/** A call that reads one configuration object that the fake tenant serves. */
function readEntity(connected, entityId) {
  return connected.callTool({
    name: 'frodo_dispatch_read_only',
    arguments: {
      skillId: 'idm.config.readConfigEntity',
      namedArgs: { entityId },
    },
  });
}

describe('the text of a tool result that holds keys named like headers', () => {
  // configuration that is about HTTP: the keys are named like headers and hold
  // every sort of value, and only the strings can hold a value to hide
  const ENTITY = {
    _id: 'external.rest',
    headers: {
      authorization: { type: 'basic', realm: 'api' },
      cookie: ['a', 'b'],
      'x-api-key': 12,
      'api-key': true,
      'proxy-authorization': null,
      'x-auth-token': {},
      'set-cookie': [],
    },
    script: {
      type: 'text/javascript',
      source: '// Cookie: none\nvar value = request.headers.get("Cookie");\n',
    },
    notes: 'the Authorization header is not sent',
  };

  test('a configuration object with such keys comes back as the JSON that it is', async () => {
    fakeAm = await startFakeAm({
      journey: 'service-account',
      accessToken: VALUE_A,
      idmEntities: { 'external.rest': ENTITY },
    });
    const connected = await startServer(
      SERVICE_ACCOUNT.arguments,
      SERVICE_ACCOUNT.environment,
      'all'
    );

    const result = await readEntity(connected, 'external.rest');
    const text = textOf(result);

    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(text);
    const data = parsed.data ?? parsed;
    // what the tenant holds is what the client reads: nothing in it is a value to hide
    expect(data.headers).toEqual(ENTITY.headers);
    expect(data.script).toEqual(ENTITY.script);
    expect(data.notes).toBe(ENTITY.notes);
    expect(text).not.toContain(VALUE_A);
  }, 90000);

  test('keys and strings that end with the name of a header and a colon come back as the JSON that they are', async () => {
    const entity = {
      _id: 'external.rest',
      'Cookie:': 'x',
      'Authorization: ': { realm: 'api' },
      'X-Api-Key:': ['a', 'b'],
      labels: {
        'Set-Cookie:': 'y',
        'Cookie: ': 12,
      },
      text: 'sent with Cookie:',
      list: ['Authorization:', 'Authorization: ', "it's", "Cookie: 'x"],
      script: "var a = 'Cookie: '; var b = 'Authorization:';\n",
    };
    fakeAm = await startFakeAm({
      journey: 'service-account',
      accessToken: VALUE_A,
      idmEntities: { 'external.rest': entity },
    });
    const connected = await startServer(
      SERVICE_ACCOUNT.arguments,
      SERVICE_ACCOUNT.environment,
      'all'
    );

    const result = await readEntity(connected, 'external.rest');
    const text = textOf(result);

    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.data ?? parsed).toEqual(entity);
  }, 90000);

  test('a string under such a key is replaced, and the text is still the JSON that it was', async () => {
    fakeAm = await startFakeAm({
      journey: 'service-account',
      accessToken: VALUE_A,
      idmEntities: {
        'external.rest': {
          _id: 'external.rest',
          headers: { authorization: 'Basic YWRtaW46cGFzcw==', accept: '*/*' },
        },
      },
    });
    const connected = await startServer(
      SERVICE_ACCOUNT.arguments,
      SERVICE_ACCOUNT.environment,
      'all'
    );

    const text = textOf(await readEntity(connected, 'external.rest'));

    const parsed = JSON.parse(text);
    const data = parsed.data ?? parsed;
    expect(data.headers).toEqual({
      authorization: 'Basic <redacted>',
      accept: '*/*',
    });
  }, 90000);
});

describe('the text of a tool result when the host URL of the connection has a user info', () => {
  const USER_INFO = [
    // the user name is long (a known value) and the password is short (under 8 characters, no known value)
    ['hostusername', 'p%40ss', 'p@ss'],
    ['hostusername', 'Pw1x', 'Pw1x'],
    // both are long
    ['hostuser', 'ZQXhostPW9876', 'ZQXhostPW9876'],
  ];

  test.each(USER_INFO)(
    'the user info of the host URL (%s:%s): a failing first request (service account): the error text',
    async (user, written, decoded) => {
      fakeAm = await startFakeAm({
        journey: 'service-account',
        accessToken: VALUE_A,
        journeys: { j1: { n1: 'ScriptedDecisionNode' } },
        failRequests: [
          { method: 'DELETE', path: '/authenticationtrees/trees/' },
        ],
      });
      const connected = await startServer(
        SERVICE_ACCOUNT.arguments,
        SERVICE_ACCOUNT.environment,
        'authentication',
        `${user}:${written}`
      );

      const text = textOf(await callWithFailingRequests(connected, 'j1'));

      // it says what failed, and where
      expect(text).toContain('/authenticationtrees/trees/j1');
      expect(text).toContain('127.0.0.1');
      expect(text).not.toContain(written);
      expect(text).not.toContain(decoded);
      expect(text).not.toContain(user);
      expect(text).not.toContain(VALUE_A);
    },
    90000
  );

  test.each(USER_INFO)(
    'the user info of the host URL (%s:%s): failing requests of a node (service account): the status of the call',
    async (user, written, decoded) => {
      fakeAm = await startFakeAm({
        journey: 'service-account',
        accessToken: VALUE_A,
        journeys: { j1: { n1: 'ScriptedDecisionNode' } },
        failRequests: [
          { method: 'DELETE', path: '/authenticationtrees/nodes/' },
        ],
      });
      const connected = await startServer(
        SERVICE_ACCOUNT.arguments,
        SERVICE_ACCOUNT.environment,
        'authentication',
        `${user}:${written}`
      );

      const text = textOf(await callWithFailingRequests(connected, 'j1'));

      expect(text).toContain('fake tenant operation failed');
      expect(text).not.toContain(written);
      expect(text).not.toContain(decoded);
      expect(text).not.toContain(user);
      expect(text).not.toContain(VALUE_A);
    },
    90000
  );

  test.each(USER_INFO)(
    'the user info of the host URL (%s:%s): a failing first request (user name and password login): the error text',
    async (user, written, decoded) => {
      fakeAm = await startFakeAm({
        journey: 'password',
        sessionToken: VALUE_B,
        sessionTtlSeconds: 3600,
        journeys: { j1: { n1: 'ScriptedDecisionNode' } },
        failRequests: [
          { method: 'DELETE', path: '/authenticationtrees/trees/' },
        ],
      });
      const connected = await startServer(
        ['admin', 'Passw0rd!', '--type', 'classic'],
        {},
        'authentication',
        `${user}:${written}`
      );

      const text = textOf(await callWithFailingRequests(connected, 'j1'));

      expect(text).toContain('/authenticationtrees/trees/j1');
      expect(text).not.toContain(written);
      expect(text).not.toContain(decoded);
      expect(text).not.toContain(user);
      expect(text).not.toContain(VALUE_B);
    },
    90000
  );
});
