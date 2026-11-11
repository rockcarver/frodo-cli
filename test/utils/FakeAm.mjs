#!/usr/bin/env node
/**
 * A minimal fake ForgeRock AM for driving the REAL frodo CLI through a
 * terminal in tests: it answers the few endpoints a username/password login
 * with an MFA code step touches, and records every request to a file.
 *
 * Run it as a SEPARATE process (`node test/utils/FakeAm.mjs`): the PTY
 * driver blocks the test's event loop, so an in-process server could not
 * answer. It prints `PORT=<n>` on stdout once it listens, and appends one
 * JSON line per request (`{ method, url, body }`) to the file named by
 * FAKE_AM_RECORD.
 *
 * The scripted journey (`POST .../authenticate`):
 *   1. no callbacks posted -> NameCallback "User Name" + PasswordCallback
 *   2. credentials posted  -> NameCallback "Enter verification code"
 *   3. the code posted     -> a session token
 * The session lookup that follows is answered with 401 on purpose: the
 * tests are about the prompt, and a deterministic failure afterwards keeps
 * the CLI's last words stable.
 *
 * FAKE_AM_REALMS=alpha,bravo makes the realm list endpoint answer with those
 * realms (otherwise it answers 404, as every unknown path does): a system with
 * more than one realm is what makes the CLI offer its realm picker.
 *
 * FAKE_AM_JOURNEY=password selects a plain login instead (no code step,
 * and the session lookup succeeds), for tests that need a command to get
 * past login without anyone typing: step 2 returns the session token and
 * everything after it is answered 404, so a command that goes on to write
 * something fails deterministically on its first write.
 *
 * FAKE_AM_JOURNEY=service-account also answers the token endpoint, so a
 * service-account login can reach post-auth realm selection and commands.
 * FAKE_AM_GRANT_ERROR=<text> makes that endpoint refuse every request that
 * is not the service-account login itself (`client_id=service-account`) with
 * `400 invalid_grant` and the text as its description, like AM does for an
 * RFC7523 assertion it does not accept.
 *
 * FAKE_AM_ISSUER_FILE=<path> names a JSON file `{ issuer?, allowedSubjects }`
 * the fake answers every trusted JWT issuer read with. FAKE_AM_USERS_FILE=<path>
 * names a JSON array of managed users (`_id`, `userName`, `givenName`, `sn`,
 * `mail`) the fake serves under `/openidm/managed/`, with IDM's `_queryFilter`
 * reduced to what the frodo user picker sends: `true`, and `or`-ed
 * `field sw|co|eq "text"` terms (an `and` group counts as `or`; `cn` is the
 * first and last name, `uid` the user name).
 * `_pageSize=0` answers the count. The same users are served by the AM users
 * endpoint (`.../json/realms/root/realms/<realm>/users`, which a classic
 * deployment has instead of IDM): AM's shape, with the attributes as lists and
 * the username filtered as `uid`. FAKE_AM_USERS_CAP=<n> makes that endpoint
 * stop at n results, in the list and in the count, as AM does at the data
 * store's maximum results (1000 by default).
 * FAKE_AM_OAUTH2_CLIENTS=<id,id,...> makes the OAuth2 client list of the realm
 * (`.../realm-config/agents/OAuth2Client`) answer with those client ids, the way
 * the OAuth2 client picker of the admin commands reads it.
 * FAKE_AM_SCRIPTS=<name,name,...> makes the script list of the realm
 * (`.../scripts`) answer with scripts of those names, the way the script
 * picker of the script commands reads it.
 * FAKE_AM_SECRETS=<id,id,...> makes the list of environment secrets
 * (`/environment/secrets`, a cloud tenant) answer with secrets of those ids; an
 * empty value is a tenant without secrets. Without it the list answers 404. The
 * calls that delete a secret or add a version to one are answered `200`, and
 * reading one of them answers its skeleton.
 * FAKE_AM_SERVICES=<id,id,...> makes the list of the AM services of the realm
 * and of the global ones (`.../services?_action=nextdescendents`) answer with
 * services of those ids; an empty value is a realm without services. Without it
 * the list answers 404. Deleting one is answered `200`.
 * FAKE_AM_SECRET_STORES_FILE=<path> names a JSON file `{ stores: [{ _id, type }],
 * mappings: { <store id>: [{ secretId, aliases }] } }` the fake serves the secret
 * stores of the realm (`.../secrets/stores?_action=nextdescendents`) and their
 * mappings from; creating or replacing a mapping is answered `200`.
 * FAKE_AM_TREES=<name,name,...> makes the journey list of the realm
 * (`.../authenticationtrees/trees`) answer with trees of those names; an empty
 * value is a realm without journeys. Without it the list answers 404. The
 * trees themselves are not served, so a command that reads one fails on it.
 * FAKE_AM_SESSION_TTL_SECONDS=<n> gives the session of a plain login a lifetime
 * of n seconds from the lookup (default: it expires in 2099).
 * The logout call (`POST .../sessions?_action=logout`) is answered like AM
 * answers it; every request is recorded, so a test counts the logouts in the
 * request log. FAKE_AM_LOGOUT=refuse makes AM refuse it (`400`), and
 * FAKE_AM_LOGOUT=hang makes it never answer.
 * FAKE_AM_LOGIN=refuse makes AM refuse the credentials of every login: the
 * authenticate call that carries callbacks is answered `401 Login failure`, as
 * AM answers a wrong password. A login is one authenticate call without
 * callbacks (it starts the journey), so a test counts the logins in the
 * request log by counting those.
 * FAKE_AM_LOGIN_DELAY_MS=<n> holds every authenticate answer for n ms, so a
 * terminal test can see what the CLI shows while a login is running.
 * FAKE_AM_FAIL_REQUESTS='[{"method":"GET","path":"/realm-config/authentication"}]'
 * makes every request with that method whose URL contains that path answer
 * `500` with the message `fake tenant operation failed`. It is checked before
 * every other route, after the request was recorded, so a test sees the failing
 * request in the request log and the CLI sees a failed operation behind a login
 * that worked.
 * FAKE_AM_LOG_API_KEYS_FILE=<path> names a JSON array of log API keys
 * (`api_key_id`, `name`) the fake serves as the log API key list (`GET /keys`)
 * and one key (`GET /keys/<id>`), and it makes the fake answer the OAuth2
 * authorize and access token calls a cloud login with a user name and password
 * makes.
 */
import fs from 'node:fs';
import http from 'node:http';

const recordPath = process.env.FAKE_AM_RECORD;
// A plain login's session lasts until 2099 unless FAKE_AM_SESSION_TTL_SECONDS
// gives it a lifetime from the moment it is looked up. A test that keeps a
// process running (and so a token refresh timer) needs a realistic expiry:
// Node cannot wait for a timer that is more than about 24 days away.
const sessionTtlSeconds = Number(process.env.FAKE_AM_SESSION_TTL_SECONDS);
const sessionExpiry = () =>
  sessionTtlSeconds > 0
    ? new Date(Date.now() + sessionTtlSeconds * 1000).toISOString()
    : '2099-01-01T00:00:00Z';
const plainLogin = process.env.FAKE_AM_JOURNEY === 'password';
const loginRefused = process.env.FAKE_AM_LOGIN === 'refuse';
const loginDelayMs = Number(process.env.FAKE_AM_LOGIN_DELAY_MS) || 0;
const serviceAccountLogin = process.env.FAKE_AM_JOURNEY === 'service-account';
const realms = (process.env.FAKE_AM_REALMS ?? '').split(',').filter(Boolean);
const readJson = (file) =>
  file ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
const issuer = readJson(process.env.FAKE_AM_ISSUER_FILE);
const users = readJson(process.env.FAKE_AM_USERS_FILE);
const failRequests = JSON.parse(process.env.FAKE_AM_FAIL_REQUESTS ?? '[]');
const logApiKeys = readJson(process.env.FAKE_AM_LOG_API_KEYS_FILE);
const oauth2Clients = (process.env.FAKE_AM_OAUTH2_CLIENTS ?? '')
  .split(',')
  .filter(Boolean);
const scripts = (process.env.FAKE_AM_SCRIPTS ?? '').split(',').filter(Boolean);
const idList = (value) =>
  value === undefined ? undefined : value.split(',').filter(Boolean);
const secrets = idList(process.env.FAKE_AM_SECRETS);
const services = idList(process.env.FAKE_AM_SERVICES);
const secretStores = readJson(process.env.FAKE_AM_SECRET_STORES_FILE);
const trees =
  process.env.FAKE_AM_TREES === undefined
    ? undefined
    : process.env.FAKE_AM_TREES.split(',').filter(Boolean);

/** The users an IDM or AM `_queryFilter` of the shapes above selects. */
function selectUsers(filter) {
  if (filter === 'true') return users;
  const terms = [...filter.matchAll(/(\w+) (sw|co|eq) "((?:[^"\\]|\\.)*)"/g)];
  return users.filter((user) =>
    terms.some(([, field, operator, quoted]) => {
      const wanted = quoted.replace(/\\(.)/g, '$1').toLowerCase();
      const have = String(
        field === 'uid'
          ? user.userName
          : field === 'cn'
            ? `${user.givenName} ${user.sn}`
            : (user[field] ?? '')
      ).toLowerCase();
      if (operator === 'co') return have.includes(wanted);
      return operator === 'eq' ? have === wanted : have.startsWith(wanted);
    })
  );
}
let step = 0;

const nameCallback = (prompt) => ({
  type: 'NameCallback',
  output: [{ name: 'prompt', value: prompt }],
  input: [{ name: 'IDToken1', value: '' }],
});
const passwordCallback = () => ({
  type: 'PasswordCallback',
  output: [{ name: 'prompt', value: 'Password' }],
  input: [{ name: 'IDToken2', value: '' }],
});

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    if (recordPath) {
      fs.appendFileSync(
        recordPath,
        JSON.stringify({ method: req.method, url: req.url, body }) + '\n'
      );
    }
    const send = (status, payload) => {
      const answer = () => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (loginDelayMs > 0 && req.url.includes('/authenticate')) {
        setTimeout(answer, loginDelayMs);
      } else {
        answer();
      }
    };
    if (
      failRequests.some(
        ({ method, path }) => req.method === method && req.url.includes(path)
      )
    ) {
      return send(500, {
        code: 500,
        reason: 'Internal Server Error',
        message: 'fake tenant operation failed',
      });
    }
    if (logApiKeys && req.method === 'GET' && req.url === '/keys') {
      return send(200, { result: logApiKeys });
    }
    if (logApiKeys && req.method === 'GET' && req.url.startsWith('/keys/')) {
      const key = logApiKeys.find(
        ({ api_key_id }) => req.url === `/keys/${api_key_id}`
      );
      return send(key ? 200 : 404, key ?? {});
    }
    if (logApiKeys && req.url.includes('/oauth2/authorize')) {
      res.writeHead(302, { location: '/?code=fake-auth-code' });
      return res.end();
    }
    if (
      (serviceAccountLogin || logApiKeys) &&
      req.url.includes('/access_token')
    ) {
      if (
        process.env.FAKE_AM_GRANT_ERROR &&
        !body.includes('client_id=service-account')
      ) {
        return send(400, {
          error: 'invalid_grant',
          error_description: process.env.FAKE_AM_GRANT_ERROR,
        });
      }
      return send(200, {
        access_token: 'fake-service-account-token',
        token_type: 'Bearer',
        expires_in: 3600,
      });
    }
    if (issuer && req.url.includes('/realm-config/agents/TrustedJwtIssuer/')) {
      return send(200, {
        _id: decodeURIComponent(req.url.split('/TrustedJwtIssuer/')[1]).split(
          '?'
        )[0],
        issuer: issuer.issuer
          ? { inherited: false, value: issuer.issuer }
          : { inherited: false },
        allowedSubjects: { inherited: false, value: issuer.allowedSubjects },
      });
    }
    const pathname = new URL(req.url, 'http://fake').pathname;
    if (
      oauth2Clients.length > 0 &&
      pathname.endsWith('/realm-config/agents/OAuth2Client')
    ) {
      return send(200, {
        result: oauth2Clients.map((_id) => ({ _id })),
        resultCount: oauth2Clients.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: oauth2Clients.length,
        remainingPagedResults: -1,
      });
    }
    if (secrets && pathname.endsWith('/environment/secrets')) {
      return send(200, {
        result: secrets.map((_id) => ({
          _id,
          description: `the secret ${_id}`,
          activeVersion: '1',
          loadedVersion: '1',
        })),
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: secrets.length,
        remainingPagedResults: -1,
      });
    }
    if (
      secrets &&
      req.method === 'GET' &&
      pathname.includes('/environment/secrets/')
    ) {
      const _id = decodeURIComponent(
        pathname.split('/environment/secrets/')[1]
      );
      return secrets.includes(_id.split('/')[0])
        ? send(200, { _id, encoding: 'generic', useInPlaceholders: true })
        : send(404, { code: 404, message: 'not found' });
    }
    if (
      secrets &&
      pathname.includes('/environment/secrets/') &&
      ['DELETE', 'POST'].includes(req.method)
    ) {
      return send(200, {});
    }
    if (
      services &&
      req.method === 'POST' &&
      pathname.endsWith('/services') &&
      new URL(req.url, 'http://fake').searchParams.get('_action') ===
        'nextdescendents'
    ) {
      return send(200, {
        result: services.map((_id) => ({
          _id,
          name: `the service ${_id}`,
          _type: { _id, name: _id, collection: false },
        })),
      });
    }
    if (
      services &&
      req.method === 'DELETE' &&
      pathname.includes('/services/')
    ) {
      return send(200, {});
    }
    if (secretStores && pathname.includes('/secrets/stores')) {
      const search = new URL(req.url, 'http://fake').searchParams;
      if (
        req.method === 'POST' &&
        pathname.endsWith('/secrets/stores') &&
        search.get('_action') === 'nextdescendents'
      ) {
        return send(200, {
          result: secretStores.stores.map(({ _id, type }) => ({
            _id,
            _type: { _id: type, name: type, collection: true },
          })),
        });
      }
      const mappings = pathname.match(
        /\/secrets\/stores\/[^/]+\/([^/]*)\/?mappings$/
      );
      if (mappings && req.method === 'GET') {
        const wanted =
          mappings[1] ||
          secretStores.stores.find(({ type }) =>
            pathname.includes(`/stores/${type}/`)
          )?._id;
        return send(200, {
          result: (secretStores.mappings?.[wanted] ?? []).map((mapping) => ({
            _id: mapping.secretId,
            ...mapping,
          })),
        });
      }
      if (mappings && req.method === 'POST') return send(200, {});
      const mapping = pathname.match(
        /\/secrets\/stores\/[^/]+\/([^/]*)\/?mappings\/([^/]+)$/
      );
      if (mapping && req.method === 'GET') {
        const found = (secretStores.mappings?.[mapping[1]] ?? []).find(
          ({ secretId }) => secretId === decodeURIComponent(mapping[2])
        );
        return found
          ? send(200, { _id: found.secretId, ...found })
          : send(404, { code: 404, message: 'not found' });
      }
      if (mapping && req.method === 'PUT') return send(200, {});
    }
    if (trees && pathname.endsWith('/authenticationtrees/trees')) {
      return send(200, {
        result: trees.map((_id) => ({ _id })),
        resultCount: trees.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: trees.length,
        remainingPagedResults: -1,
      });
    }
    if (scripts.length > 0 && pathname.endsWith('/scripts')) {
      return send(200, {
        result: scripts.map((name, index) => ({
          _id: `0000000${index + 1}-aaaa-bbbb-cccc-dddddddddddd`,
          name,
          description: '',
          default: false,
          language: 'JAVASCRIPT',
          context: 'SOCIAL_IDP_PROFILE_TRANSFORMATION',
          script: Buffer.from('// nothing').toString('base64'),
        })),
        resultCount: scripts.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: scripts.length,
        remainingPagedResults: -1,
      });
    }
    if (users && pathname.includes('/json/') && pathname.endsWith('/users')) {
      const query = new URL(req.url, 'http://fake').searchParams;
      const cap = Number(process.env.FAKE_AM_USERS_CAP ?? Infinity);
      const selected = selectUsers(query.get('_queryFilter') ?? 'true').slice(
        0,
        cap
      );
      const size = Number(query.get('_pageSize') ?? selected.length);
      const page = size === 0 ? [] : selected.slice(0, size);
      return send(200, {
        result: page.map((user) => ({
          _id: user._id,
          username: user.userName,
          uid: [user.userName],
          cn: [`${user.givenName} ${user.sn}`],
          givenName: [user.givenName],
          sn: [user.sn],
          mail: [user.mail],
        })),
        resultCount: page.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: selected.length,
        remainingPagedResults: -1,
      });
    }
    if (users && req.url.includes('/openidm/managed/')) {
      const query = new URL(req.url, 'http://fake').searchParams;
      const selected = selectUsers(query.get('_queryFilter') ?? 'true');
      const size = Number(query.get('_pageSize') ?? selected.length);
      const page = size === 0 ? [] : selected.slice(0, size);
      return send(200, {
        result: page,
        resultCount: page.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'EXACT',
        totalPagedResults: selected.length,
        remainingPagedResults: -1,
      });
    }
    if (req.url.includes('/json/serverinfo')) {
      return send(200, {
        cookieName: 'iPlanetDirectoryPro',
        realm: '/',
        domains: [],
        secureCookie: false,
      });
    }
    if (realms.length > 0 && req.url.includes('/global-config/realms')) {
      return send(200, {
        result: realms.map((name) => ({
          _id: name,
          _type: { _id: 'realm', name: 'Realm', collection: true },
          name,
          active: true,
          parentPath: '/',
          aliases: [],
        })),
        resultCount: realms.length,
        pagedResultsCookie: null,
        totalPagedResultsPolicy: 'NONE',
        totalPagedResults: -1,
        remainingPagedResults: -1,
      });
    }
    if (req.url.includes('/authenticate')) {
      const posted = body ? JSON.parse(body) : {};
      if (posted.callbacks && loginRefused) {
        return send(401, {
          code: 401,
          reason: 'Unauthorized',
          message: 'Login failure',
        });
      }
      if (!posted.callbacks) {
        step = 1;
        return send(200, {
          authId: 'fake-auth-1',
          callbacks: [nameCallback('User Name'), passwordCallback()],
        });
      }
      if (step === 1 && !plainLogin) {
        step = 2;
        return send(200, {
          authId: 'fake-auth-2',
          callbacks: [nameCallback('Enter verification code')],
        });
      }
      return send(200, { tokenId: 'fake-token', successUrl: '/', realm: '/' });
    }
    if (
      req.method === 'POST' &&
      pathname.endsWith('/sessions') &&
      new URL(req.url, 'http://fake').searchParams.get('_action') === 'logout'
    ) {
      if (process.env.FAKE_AM_LOGOUT === 'hang') return;
      if (process.env.FAKE_AM_LOGOUT === 'refuse') {
        return send(400, {
          code: 400,
          reason: 'Bad Request',
          message: 'fake AM: logout refused',
        });
      }
      return send(200, { result: 'Successfully logged out' });
    }
    if (req.url.includes('getSessionInfo')) {
      if (plainLogin) {
        return send(200, {
          username: 'someone@example.com',
          universalId: 'id=someone@example.com,ou=user,dc=openam',
          realm: '/',
          latestAccessTime: '2026-10-23T22:00:00Z',
          maxIdleExpirationTime: sessionExpiry(),
          maxSessionExpirationTime: sessionExpiry(),
          properties: { AMCtxId: 'fake' },
        });
      }
      return send(401, {
        code: 401,
        reason: 'Unauthorized',
        message: 'fake AM: no session lookup',
      });
    }
    return send(404, {});
  });
});

server.listen(0, '127.0.0.1', () => {
  console.log(`PORT=${server.address().port}`);
});
process.on('SIGTERM', () => process.exit(0));
