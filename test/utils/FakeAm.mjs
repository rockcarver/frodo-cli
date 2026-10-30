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
 * `field sw "text"` / `field eq "text"` terms (an `and` group counts as `or`).
 * `_pageSize=0` answers the count. The same users are served by the AM users
 * endpoint (`.../json/realms/root/realms/<realm>/users`, which a classic
 * deployment has instead of IDM): AM's shape, with the attributes as lists and
 * the username filtered as `uid`.
 */
import fs from 'node:fs';
import http from 'node:http';

const recordPath = process.env.FAKE_AM_RECORD;
const plainLogin = process.env.FAKE_AM_JOURNEY === 'password';
const serviceAccountLogin = process.env.FAKE_AM_JOURNEY === 'service-account';
const realms = (process.env.FAKE_AM_REALMS ?? '').split(',').filter(Boolean);
const readJson = (file) =>
  file ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
const issuer = readJson(process.env.FAKE_AM_ISSUER_FILE);
const users = readJson(process.env.FAKE_AM_USERS_FILE);

/** The users an IDM `_queryFilter` of the shapes above selects. */
function selectUsers(filter) {
  if (filter === 'true') return users;
  const terms = [...filter.matchAll(/(\w+) (sw|eq) "((?:[^"\\]|\\.)*)"/g)];
  return users.filter((user) =>
    terms.some(([, field, operator, quoted]) => {
      const wanted = quoted.replace(/\\(.)/g, '$1').toLowerCase();
      const have = String(
        user[field === 'uid' ? 'userName' : field] ?? ''
      ).toLowerCase();
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
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    if (serviceAccountLogin && req.url.includes('/access_token')) {
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
    if (users && pathname.includes('/json/') && pathname.endsWith('/users')) {
      const query = new URL(req.url, 'http://fake').searchParams;
      const selected = selectUsers(query.get('_queryFilter') ?? 'true');
      const size = Number(query.get('_pageSize') ?? selected.length);
      const page = size === 0 ? [] : selected.slice(0, size);
      return send(200, {
        result: page.map((user) => ({
          _id: user._id,
          username: user.userName,
          uid: [user.userName],
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
    if (req.url.includes('getSessionInfo')) {
      if (plainLogin) {
        return send(200, {
          username: 'someone@example.com',
          universalId: 'id=someone@example.com,ou=user,dc=openam',
          realm: '/',
          latestAccessTime: '2026-10-23T22:00:00Z',
          maxIdleExpirationTime: '2099-01-01T00:00:00Z',
          maxSessionExpirationTime: '2099-01-01T00:00:00Z',
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
