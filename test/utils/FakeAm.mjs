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
 * FAKE_AM_TRUSTED_ISSUERS_FILE=<path> names a JSON array of OAuth2 trusted JWT
 * issuers in the plain shape (a setting that is not set is `null`) the fake
 * serves as a collection (`.../realm-config/agents/TrustedJwtIssuer`), the way
 * AM does: the query answers the issuers as they are, a read by id answers one
 * with every setting wrapped in `{ inherited, value }` (no `value` for a setting
 * that is not set) or `404`, `PUT` stores one (`201` for a new id, `200`
 * otherwise; `400 Invalid attribute specified.` for a body with `_rev`, which AM
 * refuses) and `DELETE` removes one (`404` for a missing id). The issuers are
 * kept in memory for the life of the process, whatever the realm of the URL.
 * It wins over FAKE_AM_ISSUER_FILE when both are set. An empty array is a realm
 * without issuers.
 * FAKE_AM_OAUTH2_CLIENTS=<id,id,...> makes the OAuth2 client list of the realm
 * (`.../realm-config/agents/OAuth2Client`) answer with those client ids, the way
 * the OAuth2 client picker of the admin commands reads it.
 * FAKE_AM_CIMD_PROFILES=<id,id,...> makes every realm offer the agent type
 * CIMDProfile (the agent type list `.../realm-config/agents?_action=getAllTypes`
 * lists it; without the variable the list answers 404, a deployment that does not
 * have the type) and hold CIMD profiles of those ids (an empty value: none). The
 * profiles are the same in every realm and live as long as the fake: the list
 * (`.../agents/CIMDProfile?_queryFilter=true`) answers with them in the plain
 * shape, a `PUT` stores the body (`201` for a new id, which the server completes
 * with a default group the body lacks, `200` for an existing one, which stores
 * exactly the body; ids are matched ignoring case, as AM does) and refuses a `_rev` in it with `400
 * Invalid attribute specified`, and a `DELETE` removes one (`404` when missing).
 * FAKE_AM_TRUSTED_JWT_ISSUERS=<id,id,...> makes every realm hold OAuth2 trusted JWT
 * issuers of those ids (an empty value: none; without the variable the routes
 * answer 404). The issuers are the same in every realm and live as long as the
 * fake: the list (`.../agents/TrustedJwtIssuer?_queryFilter=true`) answers with
 * them in the plain shape (ids only matter), the single read answers with every
 * property wrapped as `{ inherited, value }`, a `PUT` stores the body (`201` for a
 * new id, which the server completes with a default property the body lacks,
 * `200` for an existing one, which stores exactly the body; a `_rev` in it is
 * refused with `400 Invalid attribute specified.`) and a `DELETE` removes one
 * (`404` when missing). Ids are matched exactly.
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
const trustedIssuers = readJson(process.env.FAKE_AM_TRUSTED_ISSUERS_FILE)?.map(
  (issuer) => ({ ...issuer })
);
const failRequests = JSON.parse(process.env.FAKE_AM_FAIL_REQUESTS ?? '[]');
const logApiKeys = readJson(process.env.FAKE_AM_LOG_API_KEYS_FILE);
const oauth2Clients = (process.env.FAKE_AM_OAUTH2_CLIENTS ?? '')
  .split(',')
  .filter(Boolean);
const cimdProfileIds = process.env.FAKE_AM_CIMD_PROFILES;
const cimdProfiles = new Map();
for (const _id of (cimdProfileIds ?? '').split(',').filter(Boolean)) {
  cimdProfiles.set(_id.toLowerCase(), {
    _id,
    _rev: '-1',
    _type: { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
    cimdConfig: {
      cimdClientIdUrlPatterns: [`https://${_id}.example.com/*`],
      cimdSsrfProtectionEnabled: true,
    },
  });
}
const trustedJwtIssuerIds = process.env.FAKE_AM_TRUSTED_JWT_ISSUERS;
const trustedJwtIssuers = new Map();
for (const _id of (trustedJwtIssuerIds ?? '').split(',').filter(Boolean)) {
  trustedJwtIssuers.set(_id, {
    _id,
    _rev: '-1',
    _type: {
      _id: 'TrustedJwtIssuer',
      name: 'OAuth2 Trusted JWT Issuer',
      collection: true,
    },
    issuer: `https://${_id}.example.com`,
    allowedSubjects: [],
    consentedScopesClaim: 'scope',
  });
}
// the read of one object wraps every property, as AM does
const wrapJwtIssuer = (object) =>
  Object.fromEntries(
    Object.entries(object).map(([key, value]) =>
      key.startsWith('_') ||
      (value && typeof value === 'object' && 'inherited' in value)
        ? [key, value]
        : [key, { inherited: false, value }]
    )
  );
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

/** An issuer as a read by id answers it: every setting wrapped, `value` missing when it is not set. */
function wrapIssuer(issuer) {
  return Object.fromEntries(
    Object.entries(issuer).map(([key, value]) => [
      key,
      key.startsWith('_') || key === 'agentgroup'
        ? value
        : value === null || value === undefined
          ? { inherited: false }
          : { inherited: false, value },
    ])
  );
}

/** The issuer a request body holds, with its wrapped settings made plain again. */
function plainIssuer(id, body) {
  return {
    ...Object.fromEntries(
      Object.entries(body).map(([key, value]) => [
        key,
        value && typeof value === 'object' && 'inherited' in value
          ? (value.value ?? null)
          : value,
      ])
    ),
    _id: id,
  };
}

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
    const issuerRoute = req.url
      .split('?')[0]
      .match(/\/realm-config\/agents\/TrustedJwtIssuer(?:\/([^/]+))?$/);
    if (trustedIssuers && issuerRoute) {
      const notFound = { code: 404, reason: 'Not Found', message: 'Not Found' };
      const id = issuerRoute[1] && decodeURIComponent(issuerRoute[1]);
      const index = trustedIssuers.findIndex(({ _id }) => _id === id);
      if (!id && req.method === 'GET') {
        return send(200, {
          result: trustedIssuers,
          resultCount: trustedIssuers.length,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: trustedIssuers.length,
          remainingPagedResults: -1,
        });
      }
      if (id && req.method === 'GET') {
        return index < 0
          ? send(404, notFound)
          : send(200, wrapIssuer(trustedIssuers[index]));
      }
      if (id && req.method === 'PUT') {
        const posted = body ? JSON.parse(body) : {};
        if ('_rev' in posted) {
          return send(400, {
            code: 400,
            reason: 'Bad Request',
            message: 'Invalid attribute specified.',
            detail: { validAttributes: Object.keys(posted) },
          });
        }
        const stored = { ...plainIssuer(id, posted), _rev: '1' };
        if (index < 0) trustedIssuers.push(stored);
        else trustedIssuers[index] = stored;
        return send(index < 0 ? 201 : 200, wrapIssuer(stored));
      }
      if (id && req.method === 'DELETE') {
        if (index < 0) return send(404, notFound);
        const [removed] = trustedIssuers.splice(index, 1);
        return send(200, wrapIssuer(removed));
      }
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
    if (cimdProfileIds !== undefined) {
      const query = new URL(req.url, 'http://fake').searchParams;
      if (
        req.method === 'POST' &&
        pathname.endsWith('/realm-config/agents') &&
        query.get('_action') === 'getAllTypes'
      ) {
        return send(200, {
          result: [
            { _id: 'CIMDProfile', name: 'CIMD Profile', collection: true },
          ],
        });
      }
      if (req.method === 'GET' && pathname.endsWith('/agents/CIMDProfile')) {
        return send(200, {
          result: [...cimdProfiles.values()],
          resultCount: cimdProfiles.size,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: cimdProfiles.size,
          remainingPagedResults: -1,
        });
      }
      const profilePath = pathname.split('/agents/CIMDProfile/');
      if (profilePath.length === 2) {
        const id = decodeURIComponent(profilePath[1]);
        const key = id.toLowerCase();
        if (req.method === 'PUT') {
          const posted = body ? JSON.parse(body) : {};
          if ('_rev' in posted) {
            return send(400, {
              code: 400,
              reason: 'Bad Request',
              message: 'Invalid attribute specified.',
            });
          }
          const created = !cimdProfiles.has(key);
          const stored = {
            // a created profile is completed with the server's defaults, an updated one is stored as sent
            ...(created
              ? { coreOAuth2ClientConfig: { redirectionUris: [] } }
              : {}),
            ...posted,
            _id: cimdProfiles.get(key)?._id ?? id,
            _rev: '-2',
            _type: {
              _id: 'CIMDProfile',
              name: 'CIMD Profile',
              collection: true,
            },
          };
          cimdProfiles.set(key, stored);
          return send(created ? 201 : 200, stored);
        }
        if (req.method === 'DELETE') {
          const stored = cimdProfiles.get(key);
          cimdProfiles.delete(key);
          return stored
            ? send(200, stored)
            : send(404, {
                code: 404,
                reason: 'Not Found',
                message: 'Not Found',
              });
        }
      }
    }
    if (trustedJwtIssuerIds !== undefined) {
      if (
        req.method === 'GET' &&
        pathname.endsWith('/agents/TrustedJwtIssuer')
      ) {
        return send(200, {
          result: [...trustedJwtIssuers.values()],
          resultCount: trustedJwtIssuers.size,
          pagedResultsCookie: null,
          totalPagedResultsPolicy: 'EXACT',
          totalPagedResults: trustedJwtIssuers.size,
          remainingPagedResults: -1,
        });
      }
      const issuerPath = pathname.split('/agents/TrustedJwtIssuer/');
      if (issuerPath.length === 2) {
        const id = decodeURIComponent(issuerPath[1]);
        const notFound = () =>
          send(404, { code: 404, reason: 'Not Found', message: 'Not Found' });
        if (req.method === 'GET') {
          const stored = trustedJwtIssuers.get(id);
          return stored ? send(200, wrapJwtIssuer(stored)) : notFound();
        }
        if (req.method === 'PUT') {
          const posted = body ? JSON.parse(body) : {};
          if ('_rev' in posted) {
            return send(400, {
              code: 400,
              reason: 'Bad Request',
              message: 'Invalid attribute specified.',
            });
          }
          const created = !trustedJwtIssuers.has(id);
          const stored = {
            // a created issuer is completed with the server's defaults, an updated one is stored as sent
            ...(created ? { jwksCacheTimeout: 3600000 } : {}),
            ...posted,
            _id: id,
            _rev: '-2',
            _type: {
              _id: 'TrustedJwtIssuer',
              name: 'OAuth2 Trusted JWT Issuer',
              collection: true,
            },
          };
          trustedJwtIssuers.set(id, stored);
          return send(created ? 201 : 200, wrapJwtIssuer(stored));
        }
        if (req.method === 'DELETE') {
          const stored = trustedJwtIssuers.get(id);
          trustedJwtIssuers.delete(id);
          return stored ? send(200, wrapJwtIssuer(stored)) : notFound();
        }
      }
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
