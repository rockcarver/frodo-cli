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
 * FAKE_AM_JOURNEY=password selects a plain login instead (no code step,
 * and the session lookup succeeds), for tests that need a command to get
 * past login without anyone typing: step 2 returns the session token and
 * everything after it is answered 404, so a command that goes on to write
 * something fails deterministically on its first write.
 */
import fs from 'node:fs';
import http from 'node:http';

const recordPath = process.env.FAKE_AM_RECORD;
const plainLogin = process.env.FAKE_AM_JOURNEY === 'password';
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
    if (req.url.includes('/json/serverinfo')) {
      return send(200, {
        cookieName: 'iPlanetDirectoryPro',
        realm: '/',
        domains: [],
        secureCookie: false,
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
