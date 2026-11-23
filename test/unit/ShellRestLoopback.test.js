import fs from 'fs';
import http from 'http';
import https from 'https';
import os from 'os';
import path from 'path';
import util from 'util';
import { jest } from '@jest/globals';
import { frodo, state } from '@rockcarver/frodo-lib';
import { buildRoot } from '../../src/ops/ShellExploreOps.ts';
import {
  consoleHeaders,
  createShellRest,
  getLastShellRestResult,
  idmCookieFallback,
  ShellRestError,
} from '../../src/ops/ShellRestOps.ts';
import {
  createRemoteRegistry,
  describeNode,
  toJson,
} from '../../src/ops/ShellWebSerializeOps.ts';
import { closedPort, startForwardProxy } from '../utils/ForwardProxy.js';
import { selfSignedCertificate } from '../utils/SelfSignedCertificate.js';

/**
 * The console's REST calls (the `$` of `frodo shell`) against fake servers on
 * loopback, in this process, with the library's request instances doing the
 * work (REST1). The credentials, hosts and secrets are made up.
 *
 * What it pins, case by case: which credential a call carries (L1 to L5),
 * that nothing of the tenant leaves for another host (L6, L17), the renewal
 * after a 401 (L7), a stale credential (L8), the browser-login provider (L9),
 * the shape of results and errors (L1, L10, L12, L14 to L16), that an error
 * does not print the credentials it was sent with (L11), the console's marks
 * and the header overrides (L13), retries, proxies and TLS (L18 to L20) and
 * the factory calls themselves (L21). U1 and U2 are the two small functions
 * of the console that decide headers.
 *
 * The 401 renewal of the library happens at most once every 30 seconds per
 * process, so the cases of L7 each run 2 minutes after the one before (the
 * clock of the test file moves, the sockets do not).
 *
 * The https cases make a self-signed certificate with the openssl command and
 * are reported as skipped without it; CI has it, and there they fail instead.
 */

const BEARER = 'made-up-bearer-token';
const SESSION = 'made-up-session-value';
const COOKIE_NAME = 'iPlanetDirectoryPro';
const OVERRIDE = 'made-up-override-value';
const FUTURE = () => Date.now() + 60 * 60 * 1000;
const AM_API = { 'Accept-API-Version': 'protocol=2.0,resource=4.0' };
const USERS = '/am/json/realms/root/realms/alpha/users?_queryFilter=true';

/** What a fake server does for a path (below the `/openidm` or `/am` prefix). */
function routeOf(url) {
  const pathname = new URL(url, 'http://fake').pathname;
  return pathname.replace(/^\/(openidm|am)/, '');
}

/**
 * A fake tenant (or another host) on loopback. It writes down every request
 * and answers by path: `/renew` accepts one token only, `/deny` refuses all,
 * `/flaky` fails once, `/redirect` sends the caller to `redirectTo` with the status `redirectStatus`, `/text`,
 * `/badjson`, `/empty` and `/big` answer with the body they are named for,
 * `/reply` answers what a test queued, anything else is `200 {"ok":true}`.
 */
async function startServer({ tls } = {}) {
  const seen = [];
  const replies = [];
  const sockets = new Set();
  let flaked = false;
  const control = {
    redirectTo: undefined,
    redirectStatus: 302,
    renewedToken: 'renewed-token',
  };
  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const handler = (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        cookie: req.headers.cookie,
        userAgent: req.headers['user-agent'],
        transaction: req.headers['x-forgerock-transactionid'],
        apiKey: req.headers['x-api-key'],
        contentType: req.headers['content-type'],
        ifMatch: req.headers['if-match'],
        ifNoneMatch: req.headers['if-none-match'],
        headers: req.headers,
        body: body.toString('utf8'),
        bytes: body.length,
      });
      const route = routeOf(req.url);
      if (route.startsWith('/reply') && replies.length > 0) {
        const { status, body: replyBody, headers } = replies.shift();
        return json(res, status, replyBody, headers);
      }
      if (route.startsWith('/renew')) {
        const accepted =
          req.headers.authorization === `Bearer ${control.renewedToken}`;
        return accepted
          ? json(res, 200, { renewed: true, echo: body.toString('utf8') })
          : json(res, 401, { code: 401, message: 'Access Denied' });
      }
      if (route.startsWith('/deny')) {
        return json(res, 401, { code: 401, message: 'Access Denied' });
      }
      if (route.startsWith('/flaky')) {
        if (!flaked) {
          flaked = true;
          return json(res, 503, { code: 503, message: 'Unavailable' });
        }
        return json(res, 200, { flaky: false });
      }
      if (route.startsWith('/redirect')) {
        res.writeHead(control.redirectStatus, { location: control.redirectTo });
        return res.end();
      }
      if (route.startsWith('/text')) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end('hello');
      }
      if (route.startsWith('/badjson')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end('{not json');
      }
      if (route.startsWith('/empty')) {
        res.writeHead(204);
        return res.end();
      }
      if (route.startsWith('/big')) {
        res.writeHead(200, { 'content-type': 'text/plain' });
        return res.end('x'.repeat(12 * 1024 * 1024));
      }
      return json(res, 200, { ok: true });
    });
  };
  const server = tls
    ? https.createServer(tls, handler)
    : http.createServer(handler);
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const root = `${tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}`;
  return {
    root,
    seen,
    last: () => seen[seen.length - 1],
    reply: (status, body, headers) => replies.push({ status, body, headers }),
    control,
    reset: () => {
      seen.length = 0;
      replies.length = 0;
      flaked = false;
      control.redirectTo = undefined;
      control.redirectStatus = 302;
    },
    stop: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/** The rejection of a promise (the test fails when it resolves). */
async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('the promise resolved');
}

const bearer = (token = BEARER, expires = FUTURE()) =>
  state.setBearerTokenMeta({
    access_token: token,
    expires,
    scope: 'fr:idm:* fr:am:*',
  });
const session = (token = SESSION, expires = FUTURE()) => {
  state.setCookieName(COOKIE_NAME);
  state.setUserSessionTokenMeta({
    tokenId: token,
    realm: '/',
    successUrl: '/',
    expires,
  });
};
const sessionCookie = (token = SESSION) => `${COOKIE_NAME}=${token}`;

/** Every text a script author or a log line could print of an error. */
function textsOf(error) {
  return [
    util.inspect(error, { depth: 8 }),
    util.inspect(error),
    JSON.stringify(error),
    String(error.stack),
    error.message,
    util.inspect(error.cause, { depth: 8 }),
    JSON.stringify(error.cause),
  ];
}

const proxyVariables = Object.keys(process.env).filter((name) =>
  /proxy/i.test(name)
);
const savedProxyVariables = Object.fromEntries(
  proxyVariables.map((name) => [name, process.env[name]])
);
const CERT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-rest-'));
const CERTIFICATE = selfSignedCertificate(CERT_DIR);

let tenant;
let other;
let $;

beforeAll(async () => {
  for (const name of proxyVariables) delete process.env[name];
  tenant = await startServer();
  other = await startServer();
});

afterAll(async () => {
  await tenant?.stop();
  await other?.stop();
  for (const name of Object.keys(process.env)) {
    if (/proxy/i.test(name)) delete process.env[name];
  }
  Object.assign(process.env, savedProxyVariables);
  fs.rmSync(CERT_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  tenant.reset();
  other.reset();
  state.setHost(`${tenant.root}/am`);
  $ = createShellRest();
});

afterEach(() => {
  state.setBearerTokenMeta(undefined);
  state.setUserSessionTokenMeta(undefined);
  state.setCookieName(undefined);
  state.setUseBearerTokenForAmApis(false);
  state.setTokenRefreshHandler(undefined);
  state.setRejectedCredentialHandler(undefined);
  state.setAmCredentialProvider(undefined);
  state.setAuthenticationHeaderOverrides({});
  state.setConfigurationHeaderOverrides({});
  state.setAllowInsecureConnection(false);
  state.setAxiosRetryStrategy('nothing');
  state.setAuthMode('noninteractive');
  state.setNeedsReauthentication(false);
  state.setCurlirize(false);
  state.setCurlirizeHandler(undefined);
  for (const name of Object.keys(process.env)) {
    if (/proxy/i.test(name)) delete process.env[name];
  }
  jest.restoreAllMocks();
});

describe('U1 consoleHeaders', () => {
  test('both marks without overrides', () => {
    expect(consoleHeaders()).toEqual({
      'User-Agent': '@rockcarver/frodo-cli (frodo shell)',
      'X-ForgeRock-TransactionId': expect.stringMatching(/^frodo-console-\d+$/),
    });
    expect(consoleHeaders({})).toEqual(consoleHeaders());
  });

  test('an override of a mark, in any letter case, removes that mark only', () => {
    for (const name of ['User-Agent', 'user-agent', 'USER-AGENT']) {
      expect(Object.keys(consoleHeaders({ [name]: 'mine' }))).toEqual([
        'X-ForgeRock-TransactionId',
      ]);
    }
    expect(
      Object.keys(consoleHeaders({ 'x-forgerock-transactionid': 'mine' }))
    ).toEqual(['User-Agent']);
    expect(Object.keys(consoleHeaders({ 'X-Other': 'mine' }))).toEqual([
      'User-Agent',
      'X-ForgeRock-TransactionId',
    ]);
  });
});

describe('U2 idmCookieFallback', () => {
  const cookie = { cookieName: COOKIE_NAME, cookieValue: SESSION };

  test('the session cookie when there is no bearer token', () => {
    expect(idmCookieFallback({ ...cookie })).toEqual({
      Cookie: sessionCookie(),
    });
    expect(idmCookieFallback({ ...cookie, bearerToken: '' })).toEqual({
      Cookie: sessionCookie(),
    });
  });

  test('nothing with a bearer token, or without a cookie name or value', () => {
    expect(idmCookieFallback({ ...cookie, bearerToken: BEARER })).toEqual({});
    expect(idmCookieFallback({})).toEqual({});
    expect(idmCookieFallback({ cookieName: COOKIE_NAME })).toEqual({});
    expect(idmCookieFallback({ cookieValue: SESSION })).toEqual({});
  });

  test('nothing when an override names Authorization or Cookie, in any letter case', () => {
    for (const name of ['Authorization', 'authorization', 'cookie', 'Cookie']) {
      expect(idmCookieFallback({ ...cookie }, { [name]: 'mine' })).toEqual({});
    }
    expect(idmCookieFallback({ ...cookie }, { 'X-Other': 'mine' })).toEqual({
      Cookie: sessionCookie(),
    });
  });
});

describe('credentials of a call', () => {
  test('L1 IDM sends the bearer token, and $.last has the shape of a result', async () => {
    bearer();
    const data = await $.get('/openidm/info/ping');
    expect(data).toEqual({ ok: true });
    expect(tenant.last()).toMatchObject({
      method: 'GET',
      url: '/openidm/info/ping',
      authorization: `Bearer ${BEARER}`,
      cookie: undefined,
    });
    expect($.last).toEqual({
      status: 200,
      statusText: 'OK',
      headers: expect.objectContaining({
        'content-type': 'application/json',
      }),
      data: { ok: true },
    });
    expect(getLastShellRestResult()).toBe($.last);
  });

  test('L2 AM sends the bearer token when the session uses one', async () => {
    bearer();
    session();
    state.setUseBearerTokenForAmApis(true);
    await $.get(USERS, AM_API);
    expect(tenant.last()).toMatchObject({
      url: expect.stringContaining('/am/json/realms/root/realms/alpha/users'),
      authorization: `Bearer ${BEARER}`,
      cookie: undefined,
    });
  });

  test('L3 AM sends the session cookie and no Authorization otherwise', async () => {
    bearer();
    session();
    await $.get(USERS, AM_API);
    expect(tenant.last()).toMatchObject({
      cookie: sessionCookie(),
      authorization: undefined,
    });
  });

  test('L4 IDM offers the session cookie when there is no bearer token', async () => {
    session();
    await $.get('/openidm/info/ping');
    expect(tenant.last()).toMatchObject({
      cookie: sessionCookie(),
      authorization: undefined,
    });
    // a bearer token goes first, and no cookie goes with it
    bearer();
    await $.get('/openidm/info/ping');
    expect(tenant.last()).toMatchObject({
      authorization: `Bearer ${BEARER}`,
      cookie: undefined,
    });
    // a header override of the state wins
    state.setBearerTokenMeta(undefined);
    state.setAuthenticationHeaderOverrides({ Authorization: 'override-auth' });
    await $.get('/openidm/info/ping');
    expect(tenant.last()).toMatchObject({
      authorization: 'override-auth',
      cookie: undefined,
    });
    state.setAuthenticationHeaderOverrides({});
    // neither: nothing is sent
    state.setUserSessionTokenMeta(undefined);
    await $.get('/openidm/info/ping');
    expect(tenant.last()).toMatchObject({
      authorization: undefined,
      cookie: undefined,
    });
  });

  test('L5 an absolute URL on the tenant host gets the credential of its path', async () => {
    bearer();
    session();
    await $.get(`${tenant.root}/openidm/managed/alpha_user`);
    expect(tenant.last()).toMatchObject({
      authorization: `Bearer ${BEARER}`,
      cookie: undefined,
    });
    await $.get(`${tenant.root}/am/json/realms/root/serverinfo/*`, AM_API);
    expect(tenant.last()).toMatchObject({
      cookie: sessionCookie(),
      authorization: undefined,
    });
  });

  test('L6 nothing of the tenant goes to another host', async () => {
    bearer();
    session();
    state.setAuthenticationHeaderOverrides({ 'X-Api-Key': OVERRIDE });
    state.setConfigurationHeaderOverrides({ 'X-Config': OVERRIDE });
    await $.get(`${other.root}/openidm/managed/alpha_user`);
    await $.get(`${other.root}/am/json/anything`);
    expect(other.seen).toHaveLength(2);
    for (const request of other.seen) {
      expect(request.authorization).toBeUndefined();
      expect(request.cookie).toBeUndefined();
      expect(request.apiKey).toBeUndefined();
      expect(request.headers['x-config']).toBeUndefined();
      expect(JSON.stringify(request.headers)).not.toContain(OVERRIDE);
      expect(JSON.stringify(request.headers)).not.toContain(BEARER);
      expect(JSON.stringify(request.headers)).not.toContain(SESSION);
    }
    // the same override does go to the tenant
    await $.get('/openidm/info/ping');
    expect(tenant.last()).toMatchObject({
      apiKey: OVERRIDE,
      authorization: `Bearer ${BEARER}`,
    });
  });
});

describe('L6b a URL that names the tenant for one reader and another host for the next', () => {
  /**
   * Sends `$.get(url)` with a bearer token, a session cookie, a header override
   * and a configuration override all set, and says which of the two servers
   * got the request and what of the tenant's it carried.
   */
  async function whoGets(url) {
    tenant.reset();
    other.reset();
    await $.get(url).catch(() => undefined);
    // one request, to one server
    expect(tenant.seen.length + other.seen.length).toBeLessThanOrEqual(1);
    const receiver = tenant.seen.length
      ? 'tenant'
      : other.seen.length
        ? 'other'
        : 'nobody';
    const request = (receiver === 'tenant' ? tenant : other).last();
    const headers = JSON.stringify(request?.headers ?? {});
    return {
      receiver,
      override: request?.apiKey === OVERRIDE,
      configOverride: request?.headers['x-config'] === OVERRIDE,
      // the secrets themselves, in any header
      secrets: [BEARER, SESSION, OVERRIDE].filter((secret) =>
        headers.includes(secret)
      ),
    };
  }

  // [what the URL tries, the URL, who gets it]; a request to the tenant carries
  // the header overrides, any other request carries nothing of the tenant's
  const table = (T, O) => [
    [
      'backslash ends the host as typed',
      `http://127.0.0.1:${T}\\@127.0.0.1:${O}/am/json/x`,
      'other',
    ],
    [
      'the same on an /openidm path',
      `http://127.0.0.1:${T}\\@127.0.0.1:${O}/openidm/x`,
      'other',
    ],
    [
      'the tenant as user information',
      `http://127.0.0.1:${T}@127.0.0.1:${O}/am/json/x`,
      'other',
    ],
    [
      'an encoded slash in the user information',
      `http://127.0.0.1:${T}%2f@127.0.0.1:${O}/x`,
      'other',
    ],
    [
      'an encoded backslash in the user information',
      `http://127.0.0.1:${T}%5c@127.0.0.1:${O}/x`,
      'other',
    ],
    [
      'a tab in the user information',
      `http://127.0.0.1:${T}\t@127.0.0.1:${O}/x`,
      'other',
    ],
    [
      'a new line in the user information',
      `http://127.0.0.1:${T}\n@127.0.0.1:${O}/x`,
      'other',
    ],
    [
      'user information of its own',
      `http://user:pw@127.0.0.1:${O}/openidm/x`,
      'other',
    ],
    [
      'another port of the same address',
      `http://127.0.0.1:${O}/openidm/x`,
      'other',
    ],
    [
      'upper case scheme, another port',
      `HTTP://127.0.0.1:${O}/am/json/x`,
      'other',
    ],
    [
      'another name of the same machine is another host',
      `http://localhost:${T}/openidm/x`,
      'tenant-without-credentials',
    ],
    [
      'the tenant address spelt as a number',
      `http://2130706433:${T}/openidm/x`,
      'tenant',
    ],
    [
      'upper case scheme on the tenant',
      `HTTP://127.0.0.1:${T}/openidm/x`,
      'tenant',
    ],
    [
      'the other host as user information of the tenant',
      `http://127.0.0.1:${O}\\@127.0.0.1:${T}/am/json/x`,
      'tenant',
    ],
    [
      'a new line before the tenant host',
      `http://127.0.0.1:${O}\n@127.0.0.1:${T}/am/json/x`,
      'tenant',
    ],
    [
      'the other host in the path',
      `http://127.0.0.1:${T}/%2f@127.0.0.1:${O}/x`,
      'tenant',
    ],
    [
      'the other host in the query',
      `http://127.0.0.1:${T}?@127.0.0.1:${O}/x`,
      'tenant',
    ],
    [
      'the other host in the fragment',
      `http://127.0.0.1:${T}#@127.0.0.1:${O}/x`,
      'tenant',
    ],
    [
      'a path with two slashes at its start stays on the tenant',
      `//127.0.0.1:${O}/x`,
      'tenant',
    ],
  ];

  test('every request goes where the URL as sent says, and carries the tenant credential only there', async () => {
    bearer();
    session();
    state.setAuthenticationHeaderOverrides({ 'X-Api-Key': OVERRIDE });
    state.setConfigurationHeaderOverrides({ 'X-Config': OVERRIDE });
    const T = new URL(tenant.root).port;
    const O = new URL(other.root).port;
    const found = [];
    const expected = [];
    for (const [label, url, who] of table(T, O)) {
      const got = await whoGets(url);
      const toTenant = who === 'tenant';
      found.push({
        label,
        receiver: got.receiver,
        override: got.override,
        configOverride: got.configOverride,
        // a call that is not the tenant's has none of the secrets in any header
        secrets: toTenant ? [] : got.secrets,
      });
      expected.push({
        label,
        receiver: who === 'other' ? 'other' : 'tenant',
        override: toTenant,
        configOverride: toTenant,
        secrets: [],
      });
    }
    expect(found).toEqual(expected);
  });

  test('a call to the tenant written another way carries the cookie (AM) or the bearer token (IDM)', async () => {
    bearer();
    session();
    const T = new URL(tenant.root).port;
    await $.get(`HTTP://127.0.0.1:${T}/am/json/x`, AM_API);
    expect(tenant.last()).toMatchObject({
      cookie: sessionCookie(),
      authorization: undefined,
    });
    await $.get(`http://2130706433:${T}/openidm/x`);
    expect(tenant.last()).toMatchObject({
      authorization: `Bearer ${BEARER}`,
      cookie: undefined,
    });
  });
});

describe('L7 a 401 renews the credential once', () => {
  const realNow = Date.now.bind(Date);
  let skew = 0;
  let forgotten;
  let refreshed;

  beforeAll(() => {
    Date.now = () => realNow() + skew;
  });

  beforeEach(() => {
    skew += 120000;
    forgotten = 0;
    refreshed = 0;
    tenant.control.renewedToken = 'renewed-token';
    bearer('old-token');
    state.setRejectedCredentialHandler(async () => {
      forgotten++;
      return true;
    });
    state.setTokenRefreshHandler(async () => {
      refreshed++;
      bearer('renewed-token');
    });
  });

  afterAll(() => {
    Date.now = realNow;
  });

  test('a refused token is renewed and the request, a POST too, is sent again', async () => {
    const data = await $.post('/openidm/renew', { a: 1 });
    expect(data).toEqual({ renewed: true, echo: '{"a":1}' });
    expect(tenant.seen.map((r) => [r.method, r.authorization, r.body])).toEqual(
      [
        ['POST', 'Bearer old-token', '{"a":1}'],
        ['POST', 'Bearer renewed-token', '{"a":1}'],
      ]
    );
    expect([forgotten, refreshed]).toEqual([1, 1]);
  });

  test('a second 401 is the answer: no third request', async () => {
    const error = await rejection($.get('/openidm/deny'));
    expect(error).toBeInstanceOf(ShellRestError);
    expect(error.result.status).toBe(401);
    expect(tenant.seen).toHaveLength(2);
    expect([forgotten, refreshed]).toEqual([1, 1]);
  });

  test('a credential that the caller set is not renewed', async () => {
    const error = await rejection(
      $.get('/openidm/renew', { Authorization: 'Bearer caller-token' })
    );
    expect(error.result.status).toBe(401);
    expect(tenant.seen).toHaveLength(1);
    expect([forgotten, refreshed]).toEqual([0, 0]);
  });

  test('without a refresh path the 401 stays', async () => {
    state.setTokenRefreshHandler(undefined);
    const error = await rejection($.get('/openidm/renew'));
    expect(error.result.status).toBe(401);
    expect(tenant.seen).toHaveLength(1);
    expect(forgotten).toBe(0);
  });
});

describe('credentials that cannot be used', () => {
  test('L8 a stale credential with no refresh path is refused before anything is sent', async () => {
    bearer(BEARER, Date.now() - 1000);
    const idm = await rejection($.get('/openidm/info/ping'));
    expect(idm.message).toContain('cannot be silently refreshed');
    expect(idm.message).toContain('bearer token');
    state.setBearerTokenMeta(undefined);
    session(SESSION, Date.now() - 1000);
    const am = await rejection($.get(USERS, AM_API));
    expect(am.message).toContain('cannot be silently refreshed');
    expect(am.message).toContain('session token');
    expect(tenant.seen).toHaveLength(0);
  });

  test('L8 a browser login that cannot refresh asks for a new login', async () => {
    bearer(BEARER, Date.now() - 1000);
    state.setAuthMode('interactive');
    await rejection($.get('/openidm/info/ping'));
    expect(state.getNeedsReauthentication()).toBe(true);
    expect(tenant.seen).toHaveLength(0);
  });

  test('L8 a stale credential is refreshed first when there is a way', async () => {
    bearer('stale-token', Date.now() - 1000);
    state.setTokenRefreshHandler(async () => bearer('fresh-token'));
    await $.get('/openidm/info/ping');
    expect(tenant.last().authorization).toBe('Bearer fresh-token');
  });
});

describe('L9 the credential provider of a browser login', () => {
  test('AM asks the provider, IDM sends the primary token', async () => {
    const asked = [];
    state.setAmCredentialProvider(async (scopes) => {
      asked.push(scopes);
      return { header: 'Authorization', value: 'Bearer provider-token' };
    });
    bearer();
    await $.get(USERS, AM_API);
    expect(tenant.last().authorization).toBe('Bearer provider-token');
    expect(asked).toEqual([[]]);
    await $.get('/openidm/info/ping');
    expect(tenant.last().authorization).toBe(`Bearer ${BEARER}`);
    expect(asked).toHaveLength(1);
  });
});

describe('answers', () => {
  test('L10 the text of an HTTP error names the first of message, reason, error_description, error', async () => {
    const cases = [
      [{ message: 'm', reason: 'r', error: 'e' }, 'HTTP 400: m'],
      [{ reason: 'r', error_description: 'd', error: 'e' }, 'HTTP 400: r'],
      [{ error_description: 'd', error: 'e' }, 'HTTP 400: d'],
      [{ error: 'e' }, 'HTTP 400: e'],
      [{}, 'HTTP 400'],
    ];
    for (const [body, text] of cases) {
      tenant.reply(400, body, { 'x-seen': 'yes' });
      const error = await rejection($.get('/openidm/reply'));
      expect(error).toBeInstanceOf(ShellRestError);
      expect(error.name).toBe('ShellRestError');
      expect(error.message).toBe(text);
      expect(error.result).toMatchObject({
        status: 400,
        data: body,
        headers: expect.objectContaining({ 'x-seen': 'yes' }),
      });
      // an HTTP error is a completed request
      expect($.last).toBe(error.result);
    }
  });

  test('L10 a response header that arrives more than once is one value, joined with a comma', async () => {
    tenant.reply(
      200,
      { ok: true },
      { 'set-cookie': ['a=1; Path=/', 'b=2; Path=/'] }
    );
    await $.get('/openidm/reply');
    expect($.last.headers['set-cookie']).toBe('a=1; Path=/, b=2; Path=/');
  });

  test('L12 a request that gets no answer says which one failed and keeps the last result', async () => {
    bearer();
    await $.get('/openidm/info/ping');
    const before = $.last;
    const down = await closedPort();
    state.setHost(`http://127.0.0.1:${down}/am`);
    const error = await rejection($.get('/openidm/info/ping'));
    expect(error).not.toBeInstanceOf(ShellRestError);
    expect(error.message).toMatch(/^GET \/openidm\/info\/ping failed: /);
    expect(error.message).toContain('ECONNREFUSED');
    expect(error.cause).toBeDefined();
    expect($.last).toBe(before);
  });

  test('L14 verbs, bodies, conditional headers and both forms of $.ajax', async () => {
    bearer();
    const headers = { 'If-Match': '*', 'If-None-Match': 'abc' };
    await $.post(
      '/openidm/managed/alpha_user?_action=create',
      { a: 1 },
      headers
    );
    await $.put('/openidm/managed/alpha_user/1', { b: 2 }, headers);
    await $.patch('/openidm/managed/alpha_user/1', [{ operation: 'add' }]);
    await $.delete('/openidm/managed/alpha_user/1', headers);
    await $.head('/openidm/managed/alpha_user/1');
    await $.ajax('/openidm/managed/alpha_user/2', {
      method: 'put',
      data: { c: 3 },
      headers: { 'X-Custom': 'yes' },
    });
    await $.ajax({
      url: '/openidm/managed/alpha_user/3',
      method: 'post',
      data: { d: 4 },
    });
    await $.ajax('/openidm/managed/alpha_user/4');
    expect(
      tenant.seen.map((r) => [
        r.method,
        r.url,
        r.body,
        r.ifMatch,
        r.ifNoneMatch,
      ])
    ).toEqual([
      [
        'POST',
        '/openidm/managed/alpha_user?_action=create',
        '{"a":1}',
        '*',
        'abc',
      ],
      ['PUT', '/openidm/managed/alpha_user/1', '{"b":2}', '*', 'abc'],
      [
        'PATCH',
        '/openidm/managed/alpha_user/1',
        '[{"operation":"add"}]',
        undefined,
        undefined,
      ],
      ['DELETE', '/openidm/managed/alpha_user/1', '', '*', 'abc'],
      ['HEAD', '/openidm/managed/alpha_user/1', '', undefined, undefined],
      ['PUT', '/openidm/managed/alpha_user/2', '{"c":3}', undefined, undefined],
      [
        'POST',
        '/openidm/managed/alpha_user/3',
        '{"d":4}',
        undefined,
        undefined,
      ],
      ['GET', '/openidm/managed/alpha_user/4', '', undefined, undefined],
    ]);
    for (const i of [0, 1, 2, 5, 6]) {
      expect(tenant.seen[i].contentType).toBe('application/json');
    }
    expect(tenant.seen[5].headers['x-custom']).toBe('yes');
  });

  test('L15 the URL goes out percent-encoded as typed', async () => {
    await $.get(
      '/openidm/managed/alpha_user?_queryFilter=userName eq "bjensen"&_fields=a[0],\'b\''
    );
    expect(tenant.last().url).toBe(
      '/openidm/managed/alpha_user?_queryFilter=userName+eq+%22bjensen%22&_fields=a%5B0%5D,%27b%27'
    );
  });

  test('L16 json, text, invalid json, no content, and 12 MiB in each direction', async () => {
    expect(await $.get('/openidm/info/ping')).toEqual({ ok: true });
    expect(await $.get('/openidm/text')).toBe('hello');
    expect(await $.get('/openidm/badjson')).toBe('{not json');
    expect(await $.get('/openidm/empty')).toBe('');
    expect($.last.status).toBe(204);
    const big = await $.get('/openidm/big');
    expect(big).toHaveLength(12 * 1024 * 1024);
    await $.post('/openidm/echo', { text: 'y'.repeat(12 * 1024 * 1024) });
    expect(tenant.last().bytes).toBeGreaterThan(12 * 1024 * 1024);
  });

  test('L17 a redirect to another host is followed without the credential, the header overrides or the session header', async () => {
    bearer();
    session();
    state.setAuthenticationHeaderOverrides({ 'X-Api-Key': OVERRIDE });
    state.setConfigurationHeaderOverrides({ 'X-Config': OVERRIDE });
    for (const status of [301, 302, 303, 307, 308]) {
      tenant.reset();
      other.reset();
      tenant.control.redirectStatus = status;
      tenant.control.redirectTo = `${other.root}/landed`;
      // a header the caller names after the session cookie goes the same way
      await $.get('/openidm/redirect', { [COOKIE_NAME]: SESSION });
      expect(tenant.seen).toHaveLength(1);
      expect(tenant.last().authorization).toBe(`Bearer ${BEARER}`);
      expect(tenant.last().apiKey).toBe(OVERRIDE);
      expect(other.seen).toHaveLength(1);
      expect(other.last().url).toBe('/landed');
      expect(other.last().authorization).toBeUndefined();
      expect(other.last().cookie).toBeUndefined();
      expect(other.last().apiKey).toBeUndefined();
      expect(other.last().headers['x-config']).toBeUndefined();
      expect(other.last().headers[COOKIE_NAME.toLowerCase()]).toBeUndefined();
      const text = JSON.stringify(other.last().headers);
      for (const secret of [BEARER, SESSION, OVERRIDE]) {
        expect(text).not.toContain(secret);
      }
    }
  });

  test('L17 a redirect within the tenant keeps what the first request carried', async () => {
    bearer();
    session();
    state.setAuthenticationHeaderOverrides({ 'X-Api-Key': OVERRIDE });
    tenant.control.redirectTo = `${tenant.root}/openidm/landed`;
    await $.get('/openidm/redirect');
    expect(tenant.seen.map((r) => r.url)).toEqual([
      '/openidm/redirect',
      '/openidm/landed',
    ]);
    for (const request of tenant.seen) {
      expect(request.authorization).toBe(`Bearer ${BEARER}`);
      expect(request.apiKey).toBe(OVERRIDE);
    }
  });
});

describe('L11 an error does not print what it was sent with', () => {
  function expectNoSecrets(error, secrets) {
    for (const text of textsOf(error)) {
      for (const secret of secrets) expect(text).not.toContain(secret);
    }
  }

  test('an HTTP error of IDM, with a bearer token and a header override', async () => {
    bearer();
    state.setAuthenticationHeaderOverrides({ 'X-Api-Key': OVERRIDE });
    tenant.reply(404, { code: 404, message: 'Not Found' });
    const error = await rejection($.get('/openidm/reply'));
    expect(error.result.status).toBe(404);
    expectNoSecrets(error, [BEARER, OVERRIDE]);
    // the configuration of the request stays readable for a script that asks for it by name
    expect(error.cause.config).toBeDefined();
    expect(error.cause.config.url).toContain('/openidm/reply');
  });

  test('an HTTP error of AM, with a session cookie', async () => {
    session();
    tenant.reply(404, { code: 404, message: 'Not Found' });
    const error = await rejection($.get('/am/reply', AM_API));
    expect(error.result.status).toBe(404);
    expectNoSecrets(error, [SESSION]);
  });

  test('an error with no answer, with a bearer token', async () => {
    bearer();
    const down = await closedPort();
    state.setHost(`http://127.0.0.1:${down}/am`);
    const error = await rejection($.get('/openidm/info/ping'));
    expect(error.message).toContain('failed');
    expectNoSecrets(error, [BEARER]);
  });

  test('the web console describes the error, and lets a script open its cause, without them', async () => {
    bearer();
    state.setAuthenticationHeaderOverrides({ 'X-Api-Key': OVERRIDE });
    tenant.reply(404, { code: 404, message: 'Not Found' });
    const error = await rejection($.get('/openidm/reply'));
    const node = describeNode(buildRoot(error), 0);
    expect(node.kind).toBe('error');
    for (const text of [JSON.stringify(node), toJson(error).text]) {
      expect(text).not.toContain(BEARER);
      expect(text).not.toContain(OVERRIDE);
    }
    // what the browser can ask for next: `e.cause` as a result, opened node by
    // node where it can be opened (at most 800 nodes), and its JSON
    const registry = createRemoteRegistry();
    const root = registry.describeResult(error.cause);
    const shown = [];
    const queue = [root];
    for (let i = 0; i < queue.length && i < 800; i++) {
      const next = queue[i];
      shown.push(JSON.stringify(next), registry.json(next.id)?.text ?? '');
      if (next.expandable) {
        queue.push(...(registry.children(next.id, 0, 200)?.items ?? []));
      }
    }
    // the JSON of the cause (copy and download) is the way to its request
    expect(registry.json(root.id).text.length).toBeGreaterThan(100);
    for (const text of shown) {
      expect(text).not.toContain(BEARER);
      expect(text).not.toContain(OVERRIDE);
    }
  });
});

describe('what a call sends besides the credential', () => {
  test('L13 the console marks its calls, and a header override of the same name wins', async () => {
    await $.get('/openidm/info/ping');
    expect(tenant.last()).toMatchObject({
      userAgent: '@rockcarver/frodo-cli (frodo shell)',
      transaction: expect.stringMatching(/^frodo-console-\d+$/),
    });
    // an override of a mark wins over it, in the letter case of the mark or in
    // another one (the two take different ways through the library's merge)
    for (const name of ['User-Agent', 'user-agent']) {
      state.setAuthenticationHeaderOverrides({ [name]: 'my-agent' });
      await $.get('/openidm/info/ping');
      expect(tenant.last().userAgent).toBe('my-agent');
      expect(tenant.last().transaction).toMatch(/^frodo-console-/);
      await $.get(USERS, AM_API);
      expect(tenant.last().userAgent).toBe('my-agent');
    }
    // a configuration override counts the same
    state.setAuthenticationHeaderOverrides({});
    for (const name of [
      'X-ForgeRock-TransactionId',
      'x-forgerock-transactionid',
    ]) {
      state.setConfigurationHeaderOverrides({ [name]: 'config-transaction' });
      await $.get('/openidm/info/ping');
      expect(tenant.last().transaction).toBe('config-transaction');
      expect(tenant.last().userAgent).toBe(
        '@rockcarver/frodo-cli (frodo shell)'
      );
    }
  });

  test('L13 configuration header overrides reach the tenant, calls to it only', async () => {
    state.setConfigurationHeaderOverrides({ 'X-Config': OVERRIDE });
    await $.get('/openidm/info/ping');
    await $.get(USERS, AM_API);
    expect(tenant.seen.map((r) => r.headers['x-config'])).toEqual([
      OVERRIDE,
      OVERRIDE,
    ]);
    await $.get(`${other.root}/anything`);
    expect(other.last().headers['x-config']).toBeUndefined();
  });

  test('L13 the console marks go to another host too, and a request there is its own', async () => {
    await $.get(`${other.root}/anything`);
    expect(other.last()).toMatchObject({
      userAgent: '@rockcarver/frodo-cli (frodo shell)',
      transaction: expect.stringMatching(/^frodo-console-\d+$/),
    });
  });
});

describe('network settings of the library apply', () => {
  test('L18 --retry: a failing request is sent again when the strategy says so', async () => {
    state.setAxiosRetryStrategy('everything');
    expect(await $.get('/openidm/flaky')).toEqual({ flaky: false });
    expect(tenant.seen).toHaveLength(2);
  });

  test('L18 without a strategy a failing request fails at once', async () => {
    state.setAxiosRetryStrategy('nothing');
    const error = await rejection($.get('/openidm/flaky'));
    expect(error.result.status).toBe(503);
    expect(tenant.seen).toHaveLength(1);
  });

  test('L19 HTTP_PROXY carries the request, with its credential, and NO_PROXY keeps it out', async () => {
    bearer();
    const proxy = await startForwardProxy();
    try {
      process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
      await $.get('/openidm/info/ping');
      expect(proxy.forwarded()).toEqual(['GET /openidm/info/ping']);
      expect(tenant.last().authorization).toBe(`Bearer ${BEARER}`);
      process.env.NO_PROXY = '127.0.0.1';
      await $.get('/openidm/info/pong');
      expect(proxy.forwarded()).toEqual(['GET /openidm/info/ping']);
      expect(tenant.last().url).toBe('/openidm/info/pong');
    } finally {
      await proxy.stop();
    }
  });

  test('L22 --curlirize prints a curl command for the call, with the credential hidden', async () => {
    bearer();
    const lines = [];
    state.setCurlirize(true);
    state.setCurlirizeHandler((message) => lines.push(String(message)));
    await $.get('/openidm/info/ping');
    const text = lines.join('\n');
    expect(text).toContain('curl');
    expect(text).toContain('/openidm/info/ping');
    expect(text).toContain('Authorization');
    expect(text).not.toContain(BEARER);
  });

  test('L21 each call opens the instance of its domain, with the console timeout, and nothing opens earlier', async () => {
    const idm = jest.spyOn(frodo.factory, 'generateIdmApi');
    const am = jest.spyOn(frodo.factory, 'generateAmApi');
    const release = jest.spyOn(frodo.factory, 'generateReleaseApi');
    const fresh = createShellRest();
    expect(idm).not.toHaveBeenCalled();
    expect(am).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    const timeout = expect.objectContaining({ timeout: 30000 });
    await fresh.get('/openidm/info/ping');
    expect(idm).toHaveBeenCalledTimes(1);
    expect(idm).toHaveBeenCalledWith(timeout);
    await fresh.get(USERS, AM_API);
    expect(am).toHaveBeenCalledTimes(1);
    expect(am).toHaveBeenCalledWith({}, timeout);
    await fresh.get(`${other.root}/anything`);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledWith('', timeout);
    // a URL that cannot be read is not the tenant's either
    const unreadable = await rejection(fresh.get('http://[unreadable/x'));
    expect(unreadable.message).toBe('Invalid URL');
    expect(release).toHaveBeenCalledTimes(2);
    expect(idm).toHaveBeenCalledTimes(1);
    expect(am).toHaveBeenCalledTimes(1);
  });
});

const describeHttps = CERTIFICATE || process.env.CI ? describe : describe.skip;

describeHttps('L20 an https tenant with a self-signed certificate', () => {
  let secure;

  beforeAll(async () => {
    if (!CERTIFICATE) {
      throw new Error('the openssl command is needed for the https cases');
    }
    secure = await startServer({ tls: CERTIFICATE });
  });

  afterAll(async () => {
    await secure?.stop();
  });

  beforeEach(() => {
    secure.reset();
    state.setHost(`${secure.root}/am`);
    bearer();
  });

  test('the certificate is refused unless insecure connections are allowed', async () => {
    const error = await rejection($.get('/openidm/info/ping'));
    expect(error.message).toMatch(/self[- ]signed|certificate/i);
    expect(secure.seen).toHaveLength(0);
    state.setAllowInsecureConnection(true);
    expect(await $.get('/openidm/info/ping')).toEqual({ ok: true });
    expect(secure.last().authorization).toBe(`Bearer ${BEARER}`);
  });

  test('through HTTPS_PROXY to a host named by its address', async () => {
    const proxy = await startForwardProxy();
    try {
      state.setAllowInsecureConnection(true);
      process.env.HTTPS_PROXY = `http://127.0.0.1:${proxy.port}`;
      expect(await $.get('/openidm/info/ping')).toEqual({ ok: true });
      expect(proxy.tunnels()).toEqual([secure.root.replace('https://', '')]);
      expect(secure.last().authorization).toBe(`Bearer ${BEARER}`);
    } finally {
      await proxy.stop();
    }
  });
});
