import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { WebEngine } from './ShellWebEngineOps';
import {
  buildContentSecurityPolicy,
  createRetryPause,
  renderConsolePage,
} from './ShellWebPage';
import {
  createLogBus,
  ENGINE_WORKER_ENV,
  engineStartFailureReason,
  LogBus,
  REASON_INPUT_LIMIT,
  safeEngineReason,
  SessionInfo,
  spawnTabEngine,
  startsAsEngine,
  startWebConsole,
  TabEngine,
  tabEngineCommand,
  TabEngineStartError,
  WebConsoleHandle,
} from './ShellWebServerOps';

/**
 * Security tests for the web console's local server. Whoever can talk to it
 * can run code with the connected environment's credentials, so each check
 * the server claims is attacked here with a forged request. Plain
 * http.request is used throughout: fetch will not let a test set the Host or
 * Origin headers, which are exactly what an attacker controls.
 */

/** The sentence that follows the reason of an engine that ended. */
const NEXT_INPUT =
  'The next input starts a new engine; its variables are gone.';

type Reply = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function request(
  port: number,
  options: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string | Buffer;
  } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path ?? '/',
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/** An engine that records what it was asked and answers from a script. */
function fakeEngine(): WebEngine & { evaluated: string[] } {
  const evaluated: string[] = [];
  return {
    evaluated,
    async evaluate(code) {
      evaluated.push(code);
      if (code === 'unfinished(') return { status: 'incomplete' };
      if (code === 'boom') return { status: 'error', error: new Error('boom') };
      if (code === 'tree') {
        return { status: 'ok', value: { a: { b: 1 }, list: [1, 2, 3] } };
      }
      return { status: 'ok', value: 42 };
    },
    complete: () => [['frodo.info', 'frodo.idm'], 'frodo.i'],
    history: () => [
      { text: 'older', ts: 1 },
      { text: 'oldest', ts: 2 },
    ],
    dispose: () => undefined,
  };
}
// The adapter over options.engine needs info(); the engine type itself
// does not carry one (the shared engine asks options.sessionInfo()).
function withInfo(
  engine: ReturnType<typeof fakeEngine>,
  info: () => SessionInfo
): WebEngine & { evaluated: string[] } {
  return Object.assign(engine, { info });
}

describe('ShellWebServerOps security', () => {
  let web: WebConsoleHandle;
  let engine: ReturnType<typeof fakeEngine>;
  let logs: LogBus;

  beforeEach(async () => {
    engine = withInfo(fakeEngine(), () => ({
      host: 'https://tenant.example.com/am',
    }));
    logs = createLogBus();
    web = await startWebConsole({
      engine,
      logs,
      sessionInfo: () => ({ host: 'https://tenant.example.com/am' }),
    });
  });

  afterEach(async () => {
    await web.close();
  });

  const hostHeader = () => `127.0.0.1:${web.port}`;
  const originHeader = () => `http://127.0.0.1:${web.port}`;
  const launchPath = () =>
    new URL(web.launchUrl).pathname + new URL(web.launchUrl).search;

  /** Sign in the way a browser would; returns the cookie and the page. */
  async function signIn(): Promise<{ cookie: string; csrf: string }> {
    const redeem = await request(web.port, {
      path: launchPath(),
      headers: { Host: hostHeader() },
    });
    expect(redeem.status).toBe(200);
    const setCookie = String(redeem.headers['set-cookie']?.[0]);
    const cookie = setCookie.split(';')[0];
    const page = await request(web.port, {
      headers: { Host: hostHeader(), Cookie: cookie },
    });
    expect(page.status).toBe(200);
    const csrf = /name="csrf-token" content="([^"]+)"/.exec(page.body)?.[1];
    expect(csrf).toBeTruthy();
    return { cookie, csrf: String(csrf) };
  }

  /** A signed-in JSON POST with everything an honest browser page sends. */
  async function post(
    session: { cookie: string; csrf: string },
    path: string,
    body: unknown
  ) {
    return request(web.port, {
      method: 'POST',
      path,
      headers: {
        Host: hostHeader(),
        Origin: originHeader(),
        Cookie: session.cookie,
        'X-Frodo-CSRF': session.csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  describe('where it listens', () => {
    it('binds the loopback address only', () => {
      expect(web.address).toBe('127.0.0.1');
      expect(web.launchUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/\?t=/);
    });

    it('stops listening when closed', async () => {
      const port = web.port;
      await web.close();
      await expect(
        request(port, { headers: { Host: `127.0.0.1:${port}` } })
      ).rejects.toThrow();
      // afterEach closes again; closing twice must be harmless.
    });
  });

  describe('Host header (DNS rebinding)', () => {
    it('refuses a request that names another host', async () => {
      const reply = await request(web.port, {
        path: launchPath(),
        headers: { Host: 'evil.example.com' },
      });
      expect(reply.status).toBe(403);
    });

    it('refuses the right host on the wrong port', async () => {
      const reply = await request(web.port, {
        headers: { Host: '127.0.0.1:1' },
      });
      expect(reply.status).toBe(403);
    });

    it('accepts localhost, which the same loopback socket serves', async () => {
      const reply = await request(web.port, {
        headers: { Host: `localhost:${web.port}` },
      });
      // Reaches the sign-in check (401), not the host check (403).
      expect(reply.status).toBe(401);
    });

    it('refuses a forged host even for a signed-in browser', async () => {
      const session = await signIn();
      const reply = await request(web.port, {
        path: '/api/session',
        headers: {
          Host: 'evil.example.com',
          Cookie: session.cookie,
          'X-Frodo-CSRF': session.csrf,
        },
      });
      expect(reply.status).toBe(403);
    });
  });

  describe('Origin header (cross-site requests)', () => {
    it('refuses a foreign Origin on a page request', async () => {
      const reply = await request(web.port, {
        headers: { Host: hostHeader(), Origin: 'https://evil.example.com' },
      });
      expect(reply.status).toBe(403);
    });

    it('refuses the string "null" sent by sandboxed pages', async () => {
      const reply = await request(web.port, {
        headers: { Host: hostHeader(), Origin: 'null' },
      });
      expect(reply.status).toBe(403);
    });

    it('refuses a signed-in POST that carries a foreign Origin', async () => {
      const session = await signIn();
      const reply = await request(web.port, {
        method: 'POST',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Origin: 'https://evil.example.com',
          Cookie: session.cookie,
          'X-Frodo-CSRF': session.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: '1' }),
      });
      expect(reply.status).toBe(403);
      expect(engine.evaluated).toEqual([]);
    });

    it('refuses a signed-in POST with no Origin at all', async () => {
      const session = await signIn();
      const reply = await request(web.port, {
        method: 'POST',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Cookie: session.cookie,
          'X-Frodo-CSRF': session.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: '1' }),
      });
      expect(reply.status).toBe(403);
      expect(engine.evaluated).toEqual([]);
    });
  });

  describe('the one-time sign-in link', () => {
    it('shows nothing without a link or a session', async () => {
      const reply = await request(web.port, {
        headers: { Host: hostHeader() },
      });
      expect(reply.status).toBe(401);
      expect(reply.body).not.toContain('frodo console');
    });

    it('refuses a wrong token', async () => {
      const reply = await request(web.port, {
        path: '/?t=not-the-token',
        headers: { Host: hostHeader() },
      });
      expect(reply.status).toBe(403);
      expect(reply.headers['set-cookie']).toBeUndefined();
    });

    it('signs in with the right token and sets a locked-down cookie', async () => {
      const reply = await request(web.port, {
        path: launchPath(),
        headers: { Host: hostHeader() },
      });
      // a page that goes on to the console, not a redirect: a browser sent here by
      // another site's page (the launcher file) would not send a Strict cookie
      // on the last step of a redirect chain
      expect(reply.status).toBe(200);
      expect(reply.headers.location).toBeUndefined();
      expect(reply.headers['content-type']).toMatch(/^text\/html/);
      expect(reply.body).toContain(
        '<meta http-equiv="refresh" content="0;url=/">'
      );
      expect(reply.body).not.toMatch(/<script/i);
      expect(reply.headers['content-security-policy']).toBe(
        "default-src 'none'"
      );
      expect(reply.headers['cache-control']).toBe('no-store');
      const cookie = String(reply.headers['set-cookie']?.[0]);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      // and the secret is nowhere in what it says
      expect(reply.body).not.toContain(
        new URL(web.launchUrl).searchParams.get('t')!
      );
    });

    it('works only once: a second browser with the same link is refused', async () => {
      await signIn();
      const second = await request(web.port, {
        path: launchPath(),
        headers: { Host: hostHeader() },
      });
      expect(second.status).toBe(403);
      expect(second.headers['set-cookie']).toBeUndefined();
    });

    it('lets the signed-in browser reopen the link without being locked out', async () => {
      const session = await signIn();
      const again = await request(web.port, {
        path: launchPath(),
        headers: { Host: hostHeader(), Cookie: session.cookie },
      });
      expect(again.status).toBe(302);
      expect(again.headers.location).toBe('/');
    });

    it('does not accept the launch token as a session cookie', async () => {
      const token = new URL(web.launchUrl).searchParams.get('t');
      const reply = await request(web.port, {
        headers: {
          Host: hostHeader(),
          Cookie: `frodo_console_session=${token}`,
        },
      });
      expect(reply.status).toBe(401);
    });
  });

  describe('API access', () => {
    it('refuses every API call without a session', async () => {
      for (const path of ['/api/session', '/api/events']) {
        const reply = await request(web.port, {
          path,
          headers: { Host: hostHeader() },
        });
        expect(reply.status).toBe(401);
      }
      const evalReply = await request(web.port, {
        method: 'POST',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Origin: originHeader(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: 'process.exit(1)' }),
      });
      expect(evalReply.status).toBe(401);
      expect(engine.evaluated).toEqual([]);
    });

    it('refuses a session cookie without the per-session header (CSRF)', async () => {
      const session = await signIn();
      const reply = await request(web.port, {
        method: 'POST',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Origin: originHeader(),
          Cookie: session.cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: '1' }),
      });
      expect(reply.status).toBe(401);
      expect(engine.evaluated).toEqual([]);
    });

    it('refuses a wrong per-session header', async () => {
      const session = await signIn();
      const reply = await post({ ...session, csrf: 'wrong' }, '/api/eval', {
        code: '1',
      });
      expect(reply.status).toBe(401);
      expect(engine.evaluated).toEqual([]);
    });

    it('refuses a write that is not JSON', async () => {
      const session = await signIn();
      const reply = await request(web.port, {
        method: 'POST',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Origin: originHeader(),
          Cookie: session.cookie,
          'X-Frodo-CSRF': session.csrf,
          'Content-Type': 'text/plain',
        },
        body: '{"code":"1"}',
      });
      expect(reply.status).toBe(415);
      expect(engine.evaluated).toEqual([]);
    });

    it('answers a body over the size limit with 413 and runs nothing', async () => {
      const session = await signIn();
      const reply = await post(session, '/api/eval', {
        code: 'x'.repeat(1024 * 1024 + 10),
      });
      expect(reply.status).toBe(413);
      expect(engine.evaluated).toEqual([]);
    });

    it('refuses malformed and wrongly shaped bodies', async () => {
      const session = await signIn();
      const bad = await request(web.port, {
        method: 'POST',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Origin: originHeader(),
          Cookie: session.cookie,
          'X-Frodo-CSRF': session.csrf,
          'Content-Type': 'application/json',
        },
        body: '{not json',
      });
      expect(bad.status).toBe(400);
      expect((await post(session, '/api/eval', { code: 5 })).status).toBe(400);
      expect((await post(session, '/api/eval', { code: '  ' })).status).toBe(
        400
      );
      expect((await post(session, '/api/eval', [])).status).toBe(400);
      expect(engine.evaluated).toEqual([]);
    });

    it('answers unknown paths and methods without running anything', async () => {
      const session = await signIn();
      expect((await post(session, '/api/nope', {})).status).toBe(404);
      const put = await request(web.port, {
        method: 'PUT',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Origin: originHeader(),
          Cookie: session.cookie,
          'X-Frodo-CSRF': session.csrf,
        },
      });
      expect(put.status).toBe(405);
      const other = await request(web.port, {
        path: '/etc/passwd',
        headers: { Host: hostHeader() },
      });
      expect(other.status).toBe(404);
    });
  });

  describe('what the server says back', () => {
    it('grants no cross-origin access: no CORS headers, and OPTIONS is not a preflight answer', async () => {
      const session = await signIn();
      const reply = await request(web.port, {
        method: 'OPTIONS',
        path: '/api/eval',
        headers: {
          Host: hostHeader(),
          Origin: originHeader(),
          'Access-Control-Request-Method': 'POST',
          Cookie: session.cookie,
        },
      });
      for (const header of Object.keys(reply.headers)) {
        expect(header).not.toMatch(/^access-control-/);
      }
      expect(reply.status).toBeGreaterThanOrEqual(400);
    });

    it('sends the page with a nonce-only policy and the protective headers', async () => {
      const session = await signIn();
      const page = await request(web.port, {
        headers: { Host: hostHeader(), Cookie: session.cookie },
      });
      const csp = String(page.headers['content-security-policy']);
      const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
      expect(nonce).toBeTruthy();
      expect(page.body).toContain(`<script nonce="${nonce}">`);
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('unsafe-eval');
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(page.headers['referrer-policy']).toBe('no-referrer');
      expect(page.headers['x-content-type-options']).toBe('nosniff');
      expect(page.headers['x-frame-options']).toBe('DENY');
      expect(page.headers['cache-control']).toBe('no-store');
    });

    it('uses a fresh nonce for every page load', async () => {
      const session = await signIn();
      const nonceOf = async () => {
        const page = await request(web.port, {
          headers: { Host: hostHeader(), Cookie: session.cookie },
        });
        return /nonce-([^']+)'/.exec(
          String(page.headers['content-security-policy'])
        )?.[1];
      };
      expect(await nonceOf()).not.toBe(await nonceOf());
    });

    it('never puts the sign-in secret or the cookie secret in the page', async () => {
      const session = await signIn();
      const token = String(new URL(web.launchUrl).searchParams.get('t'));
      const cookieSecret = session.cookie.split('=')[1];
      const page = await request(web.port, {
        headers: { Host: hostHeader(), Cookie: session.cookie },
      });
      expect(page.body).not.toContain(token);
      expect(page.body).not.toContain(cookieSecret);
    });

    it('does not leak internals when a request fails', async () => {
      const session = await signIn();
      const reply = await post(session, '/api/children', { id: 999999 });
      expect(reply.status).toBe(404);
      expect(reply.body).not.toMatch(/at .*\.ts|node_modules|\/Users\//);
    });
  });

  describe('working as a console', () => {
    it('evaluates, describes the result, and opens children on request', async () => {
      const session = await signIn();
      const evalReply = await post(session, '/api/eval', { code: 'tree' });
      expect(evalReply.status).toBe(200);
      const result = JSON.parse(evalReply.body).result;
      expect(result).toMatchObject({
        kind: 'object',
        expandable: true,
        preview: '{a: {…}, list: Array(3)}',
      });
      const kids = JSON.parse(
        (await post(session, '/api/children', { id: result.id })).body
      );
      expect(kids.items.map((i: { key: string }) => i.key)).toEqual([
        'a',
        'list',
      ]);
      const json = JSON.parse(
        (await post(session, '/api/json', { id: result.id })).body
      );
      expect(JSON.parse(json.text)).toEqual({ a: { b: 1 }, list: [1, 2, 3] });
    });

    it('reports unfinished input and errors as data, not as failures', async () => {
      const session = await signIn();
      const unfinished = JSON.parse(
        (await post(session, '/api/eval', { code: 'unfinished(' })).body
      );
      expect(unfinished.status).toBe('incomplete');
      const failed = JSON.parse(
        (await post(session, '/api/eval', { code: 'boom' })).body
      );
      expect(failed).toMatchObject({
        status: 'error',
        error: { name: 'Error', message: 'boom' },
      });
    });

    it('serves session info, history and completions', async () => {
      const session = await signIn();
      const info = await request(web.port, {
        path: '/api/session',
        headers: {
          Host: hostHeader(),
          Cookie: session.cookie,
          'X-Frodo-CSRF': session.csrf,
        },
      });
      expect(JSON.parse(info.body)).toEqual({
        info: { host: 'https://tenant.example.com/am' },
        history: [
          { text: 'older', ts: 1 },
          { text: 'oldest', ts: 2 },
        ],
      });
      const completed = JSON.parse(
        (await post(session, '/api/complete', { line: 'frodo.i' })).body
      );
      expect(completed).toEqual({
        candidates: ['frodo.info', 'frodo.idm'],
        replace: 'frodo.i',
      });
    });

    it('streams what a script prints to a signed-in browser', async () => {
      const session = await signIn();
      const lines: string[] = [];
      const streaming = new Promise<void>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port: web.port,
            path: '/api/events',
            headers: {
              Host: hostHeader(),
              Cookie: session.cookie,
              'X-Frodo-CSRF': session.csrf,
            },
          },
          (res) => {
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              lines.push(...chunk.split('\n').filter(Boolean));
              if (lines.some((l) => l.includes('hello from a script'))) {
                req.destroy();
                resolve();
              }
              if (lines.length === 1) logs.publish('hello from a script');
            });
          }
        );
        req.on('error', (e) =>
          (e as NodeJS.ErrnoException).code === 'ECONNRESET'
            ? resolve()
            : reject(e)
        );
        req.end();
      });
      await streaming;
      expect(lines.map((l) => JSON.parse(l))).toEqual([
        { type: 'ready' },
        { type: 'log', text: 'hello from a script' },
      ]);
    });
  });
});

describe('renderConsolePage assets', () => {
  const GOOD = {
    scripts: [
      {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.20/codemirror.min.js',
        integrity: 'sha384-C7K/Pjo6rtJFtYWv792/hBOrCLhjcAa319ZhwjrDE8zCMEWglI7',
      },
    ],
    styles: [
      {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.20/codemirror.min.css',
        integrity: 'sha384-zaeBlB/vwYsDRSlFajnDd7OydJ0cWk+c2OWybl3eSUf6hW2E',
      },
    ],
  };

  it('emits pinned, integrity-hashed tags for the assets', () => {
    const page = renderConsolePage({
      nonce: 'abc123',
      csrf: 'x456',
      assets: GOOD,
    });
    expect(page).toContain(
      'integrity="sha384-C7K/Pjo6rtJFtYWv792/hBOrCLhjcAa319ZhwjrDE8zCMEWglI7"'
    );
    expect(page).toContain('crossorigin="anonymous"');
    expect(page).toContain('rel="stylesheet"');
    expect(page).not.toContain('<script src="http://');
  });

  it('emits no external tags when there are no assets', () => {
    const page = renderConsolePage({ nonce: 'abc123', csrf: 'x456' });
    expect(page).not.toContain('crossorigin');
  });

  it('refuses an asset whose integrity is not a sha384 hash or whose extension mismatches', () => {
    expect(() =>
      renderConsolePage({
        nonce: 'abc123',
        csrf: 'x456',
        assets: {
          scripts: [{ url: GOOD.scripts[0].url, integrity: 'sha256-abc' }],
          styles: [],
        },
      })
    ).toThrow();
    expect(() =>
      renderConsolePage({
        nonce: 'abc123',
        csrf: 'x456',
        assets: {
          scripts: [
            {
              url: 'https://cdnjs.cloudflare.com/ajax/libs/x/1.0.0/lib.css',
              integrity:
                'sha384-C7K/Pjo6rtJFtYWv792/hBOrCLhjcAa319ZhwjrDE8zCMEWglI7',
            },
          ],
          styles: [],
        },
      })
    ).toThrow();
  });
});

describe('the in-page connection picker', () => {
  let web: WebConsoleHandle;
  let engine: ReturnType<typeof fakeEngine>;
  let connected: string | null;
  let profilesFile: string;

  beforeEach(async () => {
    engine = withInfo(fakeEngine(), () => ({
      host: connected ? connected : undefined,
    }));
    connected = null;
    // The endpoints read the real profiles path; point it at a temp file
    // through the env var the CLI honors, then restore it.
    profilesFile = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-profiles-')),
      'connections.json'
    );
    fs.writeFileSync(
      profilesFile,
      JSON.stringify({
        'https://zion.example.com/am': { alias: 'zion' },
        'https://arrakis.example.com/am': {},
      })
    );
    jest
      .spyOn(frodo.conn, 'getConnectionProfilesPath')
      .mockReturnValue(profilesFile);
    const logs = createLogBus();
    web = await startWebConsole({
      engine,
      logs,
      sessionInfo: () => ({ host: connected ? connected : undefined }),
      connect: async (host) => {
        connected = host;
        return host !== 'https://arrakis.example.com/am';
      },
    });
  });

  afterEach(async () => {
    await web.close();
    jest.restoreAllMocks();
    fs.rmSync(profilesFile.slice(0, profilesFile.lastIndexOf('/')), {
      recursive: true,
      force: true,
    });
  });

  const hostHeader = () => `127.0.0.1:${web.port}`;
  const originHeader = () => `http://127.0.0.1:${web.port}`;
  const launchPath = () =>
    new URL(web.launchUrl).pathname + new URL(web.launchUrl).search;

  async function signIn(): Promise<{ cookie: string; csrf: string }> {
    const redeem = await request(web.port, {
      path: launchPath(),
      headers: { Host: hostHeader() },
    });
    expect(redeem.status).toBe(200);
    const cookie = redeem.headers['set-cookie']![0].split(';')[0];
    const page = await request(web.port, {
      headers: { Host: hostHeader(), Cookie: cookie },
    });
    const csrf = /name="csrf-token" content="([^"]+)"/.exec(page.body)![1];
    return { cookie, csrf };
  }

  it('lists saved profiles with their aliases and nothing else', async () => {
    const { cookie, csrf } = await signIn();
    const reply = await request(web.port, {
      path: '/api/profiles',
      headers: { Host: hostHeader(), Cookie: cookie, 'X-Frodo-CSRF': csrf },
    });
    expect(reply.status).toBe(200);
    const parsed = JSON.parse(reply.body);
    expect(parsed.profiles).toEqual([
      {
        host: 'https://zion.example.com/am',
        alias: 'zion',
        browserLogin: false,
      },
      {
        host: 'https://arrakis.example.com/am',
        alias: undefined,
        browserLogin: false,
      },
    ]);
    expect(reply.body).not.toMatch(/password|secret|svcacct|logApiKey/i);
  });

  it('marks a profile whose saved preference is a browser login', async () => {
    fs.writeFileSync(
      profilesFile,
      JSON.stringify({
        'https://browser.example.com/am': {
          alias: 'webby',
          defaultCredential: 'browser',
        },
        'https://webby-with-sa.example.com/am': {
          defaultCredential: 'browser',
          svcacctId: 'sa-1',
        },
      })
    );
    const { cookie, csrf } = await signIn();
    const reply = await request(web.port, {
      path: '/api/profiles',
      headers: { Host: hostHeader(), Cookie: cookie, 'X-Frodo-CSRF': csrf },
    });
    expect(reply.status).toBe(200);
    const byHost = Object.fromEntries(
      JSON.parse(reply.body).profiles.map(
        (p: { host: string; browserLogin?: boolean }) => [
          p.host,
          p.browserLogin,
        ]
      )
    );
    expect(byHost['https://browser.example.com/am']).toBe(true);
    // A browser preference next to a service account credential is not
    // browser-only: the service account connects without a browser.
    expect(byHost['https://webby-with-sa.example.com/am']).toBe(false);
  });

  it('connects to a saved profile through the callback', async () => {
    const { cookie, csrf } = await signIn();
    const reply = await request(web.port, {
      method: 'POST',
      path: '/api/connect',
      headers: {
        Host: hostHeader(),
        Cookie: cookie,
        'X-Frodo-CSRF': csrf,
        Origin: originHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ host: 'https://zion.example.com/am' }),
    });
    expect(reply.status).toBe(200);
    expect(JSON.parse(reply.body)).toEqual({
      ok: true,
      info: { host: 'https://zion.example.com/am' },
    });
    // The session after the connect reflects it: the info comes from the
    // engine's own info(), not from a stale source.
    const after = JSON.parse(
      (
        await request(web.port, {
          path: '/api/session',
          headers: { Host: hostHeader(), Cookie: cookie, 'X-Frodo-CSRF': csrf },
        })
      ).body
    );
    expect(after.info).toEqual({ host: 'https://zion.example.com/am' });
  });

  it('refuses a host that is not a saved profile', async () => {
    const { cookie, csrf } = await signIn();
    const reply = await request(web.port, {
      method: 'POST',
      path: '/api/connect',
      headers: {
        Host: hostHeader(),
        Cookie: cookie,
        'X-Frodo-CSRF': csrf,
        Origin: originHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ host: 'https://evil.example.com/am' }),
    });
    expect(reply.status).toBe(404);
    expect(connected).toBeNull();
  });

  it('refuses a connect without Origin, like every other write', async () => {
    const { cookie, csrf } = await signIn();
    const reply = await request(web.port, {
      method: 'POST',
      path: '/api/connect',
      headers: {
        Host: hostHeader(),
        Cookie: cookie,
        'X-Frodo-CSRF': csrf,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ host: 'https://zion.example.com/am' }),
    });
    expect(reply.status).toBe(403);
    expect(connected).toBeNull();
  });
});

describe('a per-tab engine worker', () => {
  it('forwards its stdout logs and stderr messages to the tab stream', async () => {
    // A stub worker speaks protocol on stdout and its own notices on
    // stderr, the way the real one does when a connect opens a browser.
    // It speaks only when asked (a `speak` op), because whatever it says
    // before the tab's stream exists is dropped: the stream is per tab,
    // and the tab has not opened one yet.
    const stub = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-worker-')),
      'stub-worker.cjs'
    );
    fs.writeFileSync(
      stub,
      [
        'const rl = require("node:readline").createInterface({ input: process.stdin });',
        'const stdout = (m) => process.stdout.write(JSON.stringify(m) + "\\n");',
        'stdout({ log: "worker up" });',
        'rl.on("line", (line) => {',
        '  const m = JSON.parse(line);',
        '  if (m.op === "eval" && m.code === "speak") {',
        '    stdout({ log: "from stdout" });',
        '    process.stderr.write("from stderr\\n");',
        '    stdout({ id: m.id, op: "eval", outcome: { status: "ok" } });',
        '  } else if (m.op === "history") {',
        '    stdout({ id: m.id, op: "history", lines: [] });',
        '  } else if (m.op === "dispose") {',
        '    stdout({ id: m.id, op: "dispose" });',
        '    process.exit(0);',
        '  } else {',
        '    stdout({ id: m.id, op: m.op, ok: true });',
        '  }',
        '});',
      ].join('\n')
    );
    process.env.FRODO_TEST_WORKER_SCRIPT = stub;
    try {
      const web = await startWebConsole({
        logs: createLogBus(),
        sessionInfo: () => ({}),
      });
      try {
        const redeem = await request(web.port, {
          path: new URL(web.launchUrl).pathname + new URL(web.launchUrl).search,
          headers: { Host: `127.0.0.1:${web.port}` },
        });
        const cookie = redeem.headers['set-cookie']![0].split(';')[0];
        const page = await request(web.port, {
          headers: { Host: `127.0.0.1:${web.port}`, Cookie: cookie },
        });
        const csrf = /name="csrf-token" content="([^"]+)"/.exec(page.body)![1];
        const session = { cookie, csrf };
        // The engine id travels on the session response; later requests
        // carry it, so their routes (including events) reach this tab's
        // worker instead of spawning fresh ones.
        const sessionReply = JSON.parse(
          (
            await request(web.port, {
              path: '/api/session',
              headers: {
                Host: `127.0.0.1:${web.port}`,
                Cookie: cookie,
                'X-Frodo-CSRF': csrf,
              },
            })
          ).body
        );
        expect(typeof sessionReply.engine).toBe('string');
        const engineHeader = { 'X-Frodo-Engine': String(sessionReply.engine) };

        const lines: string[] = [];
        // The request that makes the worker speak. It is sent only once the
        // stream has said it is ready (the server subscribes the stream to the
        // worker's logs before it writes `ready`, in one step): a worker that
        // spoke earlier would be heard by nobody. It is also waited for before
        // the console closes: closing under a request that is still being
        // answered ends it with "socket hang up".
        const speak = () =>
          new Promise<void>((resolve, reject) => {
            const post = http.request(
              {
                host: '127.0.0.1',
                port: web.port,
                method: 'POST',
                path: '/api/eval',
                headers: {
                  Host: `127.0.0.1:${web.port}`,
                  Cookie: cookie,
                  'X-Frodo-CSRF': csrf,
                  Origin: `http://127.0.0.1:${web.port}`,
                  'Content-Type': 'application/json',
                  ...engineHeader,
                },
              },
              (res) => {
                res.resume();
                res.on('end', () => resolve());
              }
            );
            post.on('error', reject);
            post.end(JSON.stringify({ code: 'speak' }));
          });
        let spoke: Promise<void> | undefined;
        const streaming = new Promise<void>((resolve, reject) => {
          const req = http.request(
            {
              host: '127.0.0.1',
              port: web.port,
              path: '/api/events',
              headers: {
                Host: `127.0.0.1:${web.port}`,
                Cookie: session.cookie,
                'X-Frodo-CSRF': session.csrf,
                ...engineHeader,
              },
            },
            (res) => {
              res.setEncoding('utf8');
              res.on('data', (chunk: string) => {
                lines.push(...chunk.split('\n').filter(Boolean));
                if (!spoke && lines.some((l) => l.includes('"ready"'))) {
                  spoke = speak();
                  spoke.catch(reject);
                }
                if (
                  lines.some((l) => l.includes('from stderr')) &&
                  lines.some((l) => l.includes('from stdout'))
                ) {
                  req.destroy();
                  resolve();
                }
              });
            }
          );
          req.on('error', (e) =>
            (e as NodeJS.ErrnoException).code === 'ECONNRESET'
              ? resolve()
              : reject(e)
          );
          req.end();
        });
        await streaming;
        await spoke;
        const events = lines.map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null; // the destroyed socket can leave a torn line
          }
        });
        expect(events).toEqual(
          expect.arrayContaining([
            { type: 'ready' },
            { type: 'log', text: 'from stdout' },
            { type: 'log', text: 'from stderr' },
          ])
        );
      } finally {
        await web.close();
      }
    } finally {
      fs.rmSync(stub.slice(0, stub.lastIndexOf('/')), {
        recursive: true,
        force: true,
      });
      delete process.env.FRODO_TEST_WORKER_SCRIPT;
    }
  });
});

describe('how a tab engine is started', () => {
  const noTestScript = { PATH: '/usr/bin' };

  it('runs the executable itself, with no script and the worker variable, in the native binary', () => {
    const run = tabEngineCommand(true, noTestScript);
    expect(run.command).toBe(process.execPath);
    expect(run.args).toEqual([]);
    expect(run.env[ENGINE_WORKER_ENV]).toBe('1');
    expect(run.env.PATH).toBe('/usr/bin');
  });

  it('runs node with the bundled worker file everywhere else, and never with the worker variable', () => {
    // Even an environment that already holds the variable does not pass it on.
    const run = tabEngineCommand(
      false,
      { ...noTestScript, [ENGINE_WORKER_ENV]: '1' },
      '/dist/cli/shell/engine-worker.cjs'
    );
    expect(run.command).toBe(process.execPath);
    expect(run.args).toEqual(['/dist/cli/shell/engine-worker.cjs']);
    expect(ENGINE_WORKER_ENV in run.env).toBe(false);
  });

  it('runs the script of the test seam as given outside the binary, without the worker variable', () => {
    const run = tabEngineCommand(false, {
      ...noTestScript,
      FRODO_TEST_WORKER_SCRIPT: '/x/stub.cjs',
    });
    expect(run.args).toEqual(['/x/stub.cjs']);
    expect(ENGINE_WORKER_ENV in run.env).toBe(false);
  });

  it('ignores the test seam in the native binary: a shipped binary never runs a script that an environment variable names', () => {
    const run = tabEngineCommand(true, {
      ...noTestScript,
      FRODO_TEST_WORKER_SCRIPT: '/x/stub.cjs',
    });
    expect(run.args).toEqual([]);
    expect(run.env[ENGINE_WORKER_ENV]).toBe('1');
  });
});

describe('when the executable runs as a tab engine', () => {
  it('does so for the variable set to 1 and a standard input that is not a terminal', () => {
    expect(startsAsEngine({ [ENGINE_WORKER_ENV]: '1' }, false)).toBe(true);
  });

  it('does not on a terminal: the variable there is a mistake, and the person gets the command line', () => {
    expect(startsAsEngine({ [ENGINE_WORKER_ENV]: '1' }, true)).toBe(false);
  });

  it.each([undefined, '', '0', 'true', 'yes', '2'])(
    'does not for the value %p of the variable',
    (value) => {
      expect(startsAsEngine({ [ENGINE_WORKER_ENV]: value }, false)).toBe(false);
    }
  );
});

describe('why a tab engine did not come up', () => {
  it('takes the first line that names an error, else the first line', () => {
    expect(
      engineStartFailureReason([
        'node:internal/modules/cjs/loader:1423',
        '  throw err;',
        '',
        "Error: Cannot find module '/x/y.cjs'",
        '    at somewhere',
      ])
    ).toBe("Error: Cannot find module '/x/y.cjs'");
    expect(engineStartFailureReason(["error: unknown command '/x'"])).toBe(
      "error: unknown command '/x'"
    );
    expect(engineStartFailureReason(['boom', 'second line'])).toBe('boom');
  });

  it('skips the notices of the runtime', () => {
    expect(
      engineStartFailureReason([
        '(node:123) ExperimentalWarning: something is not available',
        '(Use `node --trace-warnings ...` to show where the warning was created)',
        'boom',
      ])
    ).toBe('boom');
  });

  it('is one clean line of at most 200 characters', () => {
    const reason = engineStartFailureReason([
      `\u001b[31mError: ${'x'.repeat(300)}\u001b[0m\u0007`,
    ]);
    expect(reason.startsWith('Error: xxx')).toBe(true);
    expect(reason).toHaveLength(200);
    expect(reason.endsWith('…')).toBe(true);
    expect(reason).not.toMatch(/[\u0000-\u001f]/);
  });

  it.each([
    ['a C1 control that is an 8-bit escape (U+009B)', '\u009b', ' '],
    ['the next line character (U+0085)', '\u0085', ' '],
    ['the delete character', '\u007f', ' '],
    ['a right-to-left override (U+202E)', '\u202e', ''],
    ['a left-to-right embedding (U+202A)', '\u202a', ''],
    ['a left-to-right isolate (U+2066)', '\u2066', ''],
    ['a pop directional isolate (U+2069)', '\u2069', ''],
    ['a left-to-right mark (U+200E)', '\u200e', ''],
    ['a right-to-left mark (U+200F)', '\u200f', ''],
    ['an Arabic letter mark (U+061C)', '\u061c', ''],
    ['a zero width space (U+200B)', '\u200b', ''],
    ['a byte order mark (U+FEFF)', '\ufeff', ''],
    ['a high surrogate that stands alone', '\ud800', ''],
    ['a low surrogate that stands alone', '\udc00', ''],
    ['a code point that is not a character (U+FFFE)', '\ufffe', ''],
    ['a code point that is not a character (U+FDD0)', '\ufdd0', ''],
  ])('removes %s', (_name, character, replacement) => {
    const reason = engineStartFailureReason([`Error: bad${character}thing`]);
    expect(reason).toBe(`Error: bad${replacement}thing`);
  });

  it('keeps the characters of a path and of a language, which are not controls', () => {
    expect(
      engineStartFailureReason([
        "Error: Cannot find module '/opt/größe/日本/x.cjs'",
      ])
    ).toBe("Error: Cannot find module '/opt/größe/日本/x.cjs'");
  });

  describe('scrubbing', () => {
    it('is done on the whole line before the cut, so that a secret across the cut leaves no head', () => {
      // The cut is at 200 characters; the password starts at 187 and ends past it.
      const line = `Error: ${'a'.repeat(170)} password=hunter2hunter2hunter2hunter2 tail`;
      const reason = engineStartFailureReason([line]);
      expect(reason).not.toContain('hunter');
      expect(reason).toContain('password=<redacted>');
      expect(reason.length).toBeLessThanOrEqual(200);
    });

    it('does the same for a Bearer value and a token of the JSON web token shape', () => {
      // the cut at 200 falls 12 characters into the value: too short for the scrub to know it
      const bearer = `Error: ${'b'.repeat(172)} Bearer abcdef0123456789ghijklmnop and more`;
      const jwt = `Error: ${'c'.repeat(160)} eyJhbGciOiJIUzI1NiJ9.${'d'.repeat(30)}.${'e'.repeat(30)}`;
      for (const line of [bearer, jwt]) {
        const reason = engineStartFailureReason([line]);
        expect(reason).not.toMatch(/abcdef01|ghijkl|eyJhbGci|ddddd|eeeee/);
        expect(reason.length).toBeLessThanOrEqual(200);
      }
    });

    it.each([
      ['password=hunter2', 'hunter2'],
      ['passwd: hunter2', 'hunter2'],
      ['client_secret=s3cr3tvalue', 's3cr3tvalue'],
      ['access_token=abc123', 'abc123'],
      ['token=abc123', 'abc123'],
      ['api_key=abc123', 'abc123'],
      ['apiKey: abc123', 'abc123'],
      ['Authorization: Bearer abc123', 'abc123'],
      ['Authorization: Basic dXNlcjpwYXNz', 'dXNlcjpwYXNz'],
      ['{"password":"hunter2","user":"x"}', 'hunter2'],
      ["{'token': 'abc123'}", 'abc123'],
      ['cookie=abc123; Path=/', 'abc123'],
      ['private_key="abc123 def456"', 'def456'],
    ])(
      'removes the value of a pair that is named like a secret: %s',
      (text, value) => {
        const reason = engineStartFailureReason([`Error: failed with ${text}`]);
        expect(reason).not.toContain(value);
        expect(reason).toContain('<redacted>');
      }
    );

    it('removes a long token that looks like a key, and a long hexadecimal number, wherever it stands', () => {
      const key = 'Zm9vYmFyMTIzNDU2Nzg5MEFCQ0RFRkdI';
      const hex = 'deadbeef'.repeat(5);
      const reason = engineStartFailureReason([
        `Error: the key ${key} and the id ${hex} failed`,
      ]);
      expect(reason).toBe(
        'Error: the key <redacted> and the id <redacted> failed'
      );
    });

    it('keeps what a person needs of the common failures: the error, the command, the module and its path', () => {
      for (const line of [
        "error: unknown command '/opt/frodo/dist/cli/shell/engine-worker.cjs'",
        "Error: Cannot find module '/opt/frodo/dist/cli/shell/engine-worker.cjs'",
        "Error: ENOTDIR: not a directory, mkdir '/dev/null/x/.frodo/shell-history'",
        'Error: normalizeExpandedHelpArgv is not a function',
        'error: unknown option --engine-worker-process-id',
      ]) {
        expect(engineStartFailureReason([line])).toBe(line);
      }
    });

    it('keeps a path, an error code and a name with dots readable, even when they hold digits', () => {
      for (const line of [
        "Error: Cannot find module '/home/user/projects/my-long-project-name-2024-final/node_modules/x/index.js'",
        "Error: Cannot find module 'node_modules/some-very-long-package-name-v2/index.js'",
        'Error: ENOENT: no such file or directory, open C:\\Users\\me\\my-long-project-name-2024-final\\x.json',
        'Error [ERR_HTTP2_STREAM_ERROR]: Stream closed with error code NGHTTP2_INTERNAL_ERROR',
        'Error: ERR_MODULE_NOT_FOUND_2 for engine-worker-process-2024.cjs',
        'Error: cannot open ~/projects/my-long-project-name-2024/x',
        'Error: ENOTDIR ENOENT EACCES EAGAIN',
      ]) {
        expect(engineStartFailureReason([line])).toBe(line);
      }
    });

    it('still removes a key that has the shape of a long token, next to a path', () => {
      const reason = engineStartFailureReason([
        'Error: /x/y.cjs failed with Zm9vYmFyMTIzNDU2Nzg5MEFCQ0RFRkdI',
      ]);
      expect(reason).toBe('Error: /x/y.cjs failed with <redacted>');
    });

    it('removes the start of a token of the JSON web token shape that a cut left without its end', () => {
      const reason = engineStartFailureReason([
        `Error: eyJhbGciOiJIUzI1NiJ9.${'p'.repeat(3000)}.signature`,
      ]);
      expect(reason).toBe('Error: <redacted>');
    });

    it('removes the start of a web-token shape whatever its letters are, with no digit to give it away', () => {
      const reason = engineStartFailureReason([
        `Error: eyJabcdefghijklmnopqrstuvwxyzABCDEF.${'q'.repeat(300)}`,
      ]);
      expect(reason).toBe('Error: <redacted>');
    });

    it('removes a value that goes on past the bound of what is looked at', () => {
      const reason = engineStartFailureReason([
        `Error: password=${'S'.repeat(3 * REASON_INPUT_LIMIT)}`,
      ]);
      expect(reason).toBe('Error: password=<redacted>');
    });

    it('removes the values that the caller names, whatever shape they have', () => {
      const secret = 'abcdefghijklmnop';
      expect(
        engineStartFailureReason([`Error: leaked ${secret} here`], {}, [secret])
      ).toBe('Error: leaked <redacted> here');
      expect(safeEngineReason(`x ${secret} y`, [secret])).toBe(
        'x <redacted> y'
      );
      // and without it the same text is left alone (no rule is meant to hide a plain word)
      expect(safeEngineReason(`x ${secret} y`)).toBe(`x ${secret} y`);
    });
  });

  describe('a line that a process makes huge', () => {
    // What a process writes is hostile input: the time it takes to treat a line
    // must not depend on how long the line is. A pattern with an open name part
    // takes seconds on a few thousand characters and hours on millions, and a
    // regular expression cannot be interrupted: so a small line is timed first,
    // and the big ones are only run when that was quick.
    const small = [
      `Error: ${'a'.repeat(30_000)}`,
      `Error: ${'password'.repeat(400)}`,
    ];
    let quick = false;
    beforeAll(() => {
      const started = performance.now();
      for (const line of small) engineStartFailureReason([line]);
      quick = performance.now() - started < 250;
    });

    it('is quick for a line of thirty thousand characters, and of repeated keywords', () => {
      expect(quick).toBe(true);
    });

    const shapes: [string, string][] = [
      ['letters', 'a'.repeat(4_000_000)],
      ['the word password', 'password'.repeat(500_000)],
      ['the word secret', 'secret'.repeat(700_000)],
      ['the word token', 'token'.repeat(800_000)],
      ['letters and digits', 'a1'.repeat(2_000_000)],
      ['white space', ' '.repeat(4_000_000)],
      ['escape sequences', '\u001b['.repeat(2_000_000)],
      ['quotes', '"'.repeat(4_000_000)],
      ['keys', 'api_key='.repeat(500_000)],
    ];

    it.each(shapes)(
      'is treated in well under a second: %s',
      (_name, filler) => {
        if (!quick) throw new Error('not run: the small line was already slow');
        const started = performance.now();
        const reason = engineStartFailureReason([`Error: ${filler}`]);
        const elapsed = performance.now() - started;
        expect(elapsed).toBeLessThan(250);
        expect(reason.length).toBeLessThanOrEqual(200);
        expect(reason.startsWith('Error:')).toBe(true);
      }
    );

    it('is treated in well under a second when it is the whole text handed to safeEngineReason', () => {
      if (!quick) throw new Error('not run: the small line was already slow');
      const started = performance.now();
      safeEngineReason('password'.repeat(500_000), ['abcdefghijklmnop']);
      expect(performance.now() - started).toBeLessThan(250);
    });

    it('looks at no more than REASON_INPUT_LIMIT characters', () => {
      expect(REASON_INPUT_LIMIT).toBe(2000);
    });
  });

  it('does not take a line of a trace for the reason of a process that ended after it answered', () => {
    const trace = [
      '48: 0x101bda6e8 Builtins_JSEntryTrampoline [/usr/local/bin/node]',
      '49: 0x101bda788 Builtins_JSEntryTrampoline [/usr/local/bin/node]',
    ];
    expect(engineStartFailureReason(trace, { code: 134, answered: true })).toBe(
      'The engine process ended with exit code 134.'
    );
    expect(
      engineStartFailureReason(trace, { signal: 'SIGABRT', answered: true })
    ).toBe('The engine process was stopped by the signal SIGABRT.');
    // a process that never came up still says its first line
    expect(engineStartFailureReason(trace, { code: 134 })).toBe(trace[0]);
  });

  it('counts a fatal error of the runtime as a line that names an error', () => {
    const lines = [
      '<--- Last few GCs --->',
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      '1: 0x101bda788 Builtins_JSEntryTrampoline [/usr/local/bin/node]',
    ];
    const expected =
      'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory';
    expect(engineStartFailureReason(lines)).toBe(expected);
    expect(engineStartFailureReason(lines, { answered: true })).toBe(expected);
  });

  it('describes a process that ended after it answered without saying that it did not answer', () => {
    expect(engineStartFailureReason([], { code: 3, answered: true })).toBe(
      'The engine process ended with exit code 3.'
    );
    expect(
      engineStartFailureReason([], {
        code: null,
        signal: 'SIGKILL',
        answered: true,
      })
    ).toBe('The engine process was stopped by the signal SIGKILL.');
    expect(engineStartFailureReason([], { answered: true })).toBe(
      'The engine process ended with exit code unknown.'
    );
    // a line it wrote is quoted as for a process that never came up
    expect(
      engineStartFailureReason(['noise', 'RangeError: x'], { answered: true })
    ).toBe('RangeError: x');
  });

  it('describes a process that wrote nothing by how it ended', () => {
    expect(engineStartFailureReason([], { code: 3 })).toBe(
      'The engine process ended with exit code 3 before it answered.'
    );
    expect(
      engineStartFailureReason([], { code: null, signal: 'SIGKILL' })
    ).toBe(
      'The engine process was stopped by the signal SIGKILL before it answered.'
    );
  });
});

describe('a tab engine that cannot start or that ends', () => {
  let web: WebConsoleHandle;
  let dir: string;
  let errors: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-worker-'));
    errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // for a test that never starts a console
    web = { close: async () => undefined } as unknown as WebConsoleHandle;
  });

  afterEach(async () => {
    await web.close();
    jest.restoreAllMocks();
    delete process.env.FRODO_TEST_WORKER_SCRIPT;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A worker that is a script of the given lines (`process` and `require` are there). */
  function stub(lines: string[]): string {
    const file = path.join(dir, 'stub-worker.cjs');
    fs.writeFileSync(file, lines.join('\n'));
    return file;
  }

  async function startAndSignIn(
    options: Partial<Parameters<typeof startWebConsole>[0]> = {}
  ) {
    web = await startWebConsole({
      logs: createLogBus(),
      sessionInfo: () => ({}),
      ...options,
    });
    const host = `127.0.0.1:${web.port}`;
    const redeem = await request(web.port, {
      path: new URL(web.launchUrl).pathname + new URL(web.launchUrl).search,
      headers: { Host: host },
    });
    const cookie = redeem.headers['set-cookie']![0].split(';')[0];
    const page = await request(web.port, {
      headers: { Host: host, Cookie: cookie },
    });
    const csrf = /name="csrf-token" content="([^"]+)"/.exec(page.body)![1];
    const headers = {
      Host: host,
      Cookie: cookie,
      'X-Frodo-CSRF': csrf,
    };
    return {
      host,
      headers,
      // what a page holds, for a test that wants to leak it
      secrets: {
        link: new URL(web.launchUrl).searchParams.get('t')!,
        session: cookie.split('=')[1],
        csrf,
      },
      session: (extra: Record<string, string> = {}) =>
        request(web.port, {
          path: '/api/session',
          headers: { ...headers, ...extra },
        }),
      evaluate: (engine: string, code: string) =>
        request(web.port, {
          method: 'POST',
          path: '/api/eval',
          headers: {
            ...headers,
            Origin: `http://${host}`,
            'Content-Type': 'application/json',
            'X-Frodo-Engine': engine,
          },
          body: JSON.stringify({ code }),
        }),
    };
  }

  it('answers 503 with the reason, not "Internal error", when the worker script is missing', async () => {
    process.env.FRODO_TEST_WORKER_SCRIPT = path.join(dir, 'missing.cjs');
    const { session } = await startAndSignIn();
    const reply = await session();
    expect(reply.status).toBe(503);
    const { error } = JSON.parse(reply.body);
    expect(error).toMatch(/^The console could not start an engine: /);
    expect(error).toMatch(/Cannot find module/);
    expect(error).not.toMatch(/Internal error/);
  });

  it('answers 503 with the first line a worker wrote when it ends at once', async () => {
    process.env.FRODO_TEST_WORKER_SCRIPT = stub([
      'process.stderr.write("boom: no engine today\\n");',
      'process.stderr.write("a second line that stays inside\\n");',
      'process.exit(3);',
    ]);
    const { session } = await startAndSignIn();
    const reply = await session();
    expect(reply.status).toBe(503);
    expect(JSON.parse(reply.body).error).toBe(
      'The console could not start an engine: boom: no engine today'
    );
  });

  it('says so in the terminal once, however often the page asks again', async () => {
    process.env.FRODO_TEST_WORKER_SCRIPT = stub([
      'process.stderr.write("boom: no engine today\\n");',
      'process.exit(3);',
    ]);
    const { session } = await startAndSignIn();
    for (let i = 0; i < 3; i++) expect((await session()).status).toBe(503);
    const told = errors.mock.calls.filter((call) =>
      String(call[0]).includes('boom: no engine today')
    );
    expect(told).toHaveLength(1);
    expect(String(told[0][0])).toContain(
      'The console could not start an engine: boom: no engine today'
    );
  });

  it('leaves a secret that the worker wrote out of the reply and the terminal', async () => {
    const token = `eyJhbGciOiJIUzI1NiJ9.${'a'.repeat(40)}.${'b'.repeat(40)}`;
    process.env.FRODO_TEST_WORKER_SCRIPT = stub([
      `process.stderr.write("Error: request failed with Bearer ${token}\\n");`,
      'process.exit(1);',
    ]);
    const { session } = await startAndSignIn();
    const reply = await session();
    expect(reply.status).toBe(503);
    expect(reply.body).not.toContain(token);
    expect(reply.body).toContain('<redacted>');
    expect(JSON.stringify(errors.mock.calls)).not.toContain(token);
  });

  it('leaves the three secrets of this server out of the reply and the terminal, whatever the worker wrote', async () => {
    // Secrets made of letters only (no digit), so that no rule for long tokens
    // is what hides them: the server must name them to the scrub itself.
    const real = crypto.randomBytes.bind(crypto);
    const fills = [1, 2, 3];
    jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementation(((size: number) =>
        size === 32
          ? Buffer.alloc(32, fills.shift() ?? 4)
          : real(size)) as typeof crypto.randomBytes);
    process.env.FRODO_TEST_WORKER_SCRIPT = stub([
      'process.stderr.write("Error: leaked " + process.env.TEST_LEAK + "\\n");',
      'process.exit(1);',
    ]);
    const { session, secrets } = await startAndSignIn();
    const leaked = [secrets.link, secrets.session, secrets.csrf];
    expect(new Set(leaked).size).toBe(3);
    for (const value of leaked) expect(value).not.toMatch(/\d/);
    process.env.TEST_LEAK = leaked.join(' ');
    try {
      const reply = await session();
      expect(reply.status).toBe(503);
      for (const value of leaked) {
        expect(reply.body).not.toContain(value);
        expect(JSON.stringify(errors.mock.calls)).not.toContain(value);
      }
      expect(reply.body).toContain('<redacted>');
    } finally {
      delete process.env.TEST_LEAK;
    }
  });

  it('scrubs the secrets that it is given from the reason of an engine it starts itself', async () => {
    process.env.FRODO_TEST_WORKER_SCRIPT = stub([
      'process.stderr.write("Error: leaked abcdefghijklmnop here\\n");',
      'process.exit(1);',
    ]);
    const engine = await spawnTabEngine(undefined, {
      secrets: ['abcdefghijklmnop'],
    });
    await expect(engine.info()).rejects.toThrow(
      'Error: leaked <redacted> here'
    );
    // without it the word is just a word
    const plain = await spawnTabEngine();
    await expect(plain.info()).rejects.toThrow(
      'Error: leaked abcdefghijklmnop here'
    );
  });

  it('makes the reason of an engine that the caller supplied safe too, with the secrets of this server', async () => {
    const real = crypto.randomBytes.bind(crypto);
    const fills = [1, 2, 3];
    jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementation(((size: number) =>
        size === 32
          ? Buffer.alloc(32, fills.shift() ?? 4)
          : real(size)) as typeof crypto.randomBytes);
    let leaked = '';
    const failing: TabEngine = {
      evaluate: async () => ({ status: 'ok' }),
      children: async () => null,
      json: async () => null,
      complete: async () => [[], ''],
      history: async () => [],
      connect: async () => ({ ok: false, info: {} }),
      info: async () => {
        throw new TabEngineStartError(`Error: leaked ${leaked}\u202e done`);
      },
      reset: async () => undefined,
      dispose: () => undefined,
    };
    const { session, secrets } = await startAndSignIn({
      spawnEngine: async () => failing,
    });
    leaked = [secrets.link, secrets.session, secrets.csrf].join(' ');
    const reply = await session();
    expect(reply.status).toBe(503);
    for (const value of [secrets.link, secrets.session, secrets.csrf]) {
      expect(reply.body).not.toContain(value);
      expect(JSON.stringify(errors.mock.calls)).not.toContain(value);
    }
    // and the characters that drive a terminal are gone from it as well
    expect(reply.body).not.toContain('\u202e');
    expect(JSON.parse(reply.body).error).toBe(
      'The console could not start an engine: Error: leaked <redacted> <redacted> <redacted> done'
    );
  });

  it('disposes the failed engine once and forgets it', async () => {
    let disposed = 0;
    const failing: TabEngine = {
      evaluate: async () => ({ status: 'ok' }),
      children: async () => null,
      json: async () => null,
      complete: async () => [[], ''],
      history: async () => {
        throw new TabEngineStartError('no engine today');
      },
      connect: async () => ({ ok: false, info: {} }),
      info: async () => {
        throw new TabEngineStartError('no engine today');
      },
      reset: async () => undefined,
      dispose: () => {
        disposed++;
      },
    };
    const { session } = await startAndSignIn({
      spawnEngine: async () => failing,
    });
    expect((await session()).status).toBe(503);
    expect(disposed).toBe(1);
    // Closing the console disposes every engine it still holds: the failed one
    // is no longer among them.
    await web.close();
    expect(disposed).toBe(1);
  });

  describe('after it answered', () => {
    let spawnLog: string;

    /**
     * A worker that answers like an engine does and ends in the way that the
     * code of an eval says: `crash` writes an error line and exits, `exit3` exits
     * without a word, `kill` kills itself, `hang` never answers and ends 150 ms
     * later, `idle` answers and ends 150 ms later, `warn` writes an error line
     * and answers, `spam` writes many lines (the last one names an error) and
     * ends, `leak` writes what TEST_LEAK holds, `leakidle` answers and then writes it as it ends, `wait` never answers, `die:<line>` writes the line and ends, `keep:<text>` keeps the text and `kept` answers it (what an engine remembers), `longline` writes one line of 300 characters, `window` writes 52 lines (an early error line, one that is the 21st from the end, one that is the 20th and stays), `oomlong` and `oomshort` end like an out-of-memory abort with a long and a short native trace, `say` logs a line and answers, `who` answers its process id.
     * Every start is a line of the file `spawnLog`.
     */
    function answeringStub(): string {
      spawnLog = path.join(dir, 'spawns.log');
      return stub([
        `require("node:fs").appendFileSync(${JSON.stringify(spawnLog)}, process.pid + "\\n");`,
        'const rl = require("node:readline").createInterface({ input: process.stdin });',
        'const say = (m, reply) => process.stdout.write(JSON.stringify({ id: m.id, op: m.op, ...reply }) + "\\n");',
        'const say_ok = (m, result) => say(m, { outcome: { status: "ok", result } });',
        'const end_in = (ms, line) => setTimeout(() => { if (line) process.stderr.write(line + "\\n"); process.exit(1); }, ms);',
        'let kept;',
        'rl.on("line", (line) => {',
        '  const m = JSON.parse(line);',
        '  if (m.op === "dispose") process.exit(0);',
        '  if (m.op !== "eval") return say(m, m.op === "history" ? { lines: [] } : { info: {} });',
        '  if (m.code.startsWith("die:")) { process.stderr.write(m.code.slice(4) + "\\n"); process.exit(1); }',
        '  if (m.code.startsWith("keep:")) { kept = m.code.slice(5); return say_ok(m, kept); }',
        '  switch (m.code) {',
        '    case "kept": return say_ok(m, kept);',
        '    case "who": return say_ok(m, process.pid);',
        '    case "crash": process.stderr.write("RangeError: boom after start\\n"); process.exit(1);',
        '    case "exit3": process.exit(3);',
        '    case "kill": process.kill(process.pid, "SIGKILL"); return;',
        '    case "hang": end_in(150, "RangeError: while busy"); return;',
        '    case "idle": say_ok(m, process.pid); end_in(150, "RangeError: while idle"); return;',
        '    case "warn": process.stderr.write("Error: sign-in failed\\n"); setTimeout(() => say_ok(m, process.pid), 150); return;',
        '    case "spam": for (let i = 1; i <= 25; i++) process.stderr.write("filler " + i + "\\n"); process.stderr.write("TypeError: the last one\\n"); end_in(100); return;',
        '    case "leak": process.stderr.write("Error: leaked " + process.env.TEST_LEAK + "\\n"); process.exit(1);',
        '    case "leakidle": say_ok(m, 1); end_in(150, "Error: leaked " + process.env.TEST_LEAK); return;',
        '    case "wait": return;',
        '    case "longline": process.stderr.write("Error: " + "x".repeat(300) + "\\n"); process.exit(1);',
        '    case "say": process.stdout.write(JSON.stringify({ log: "hello from the engine" }) + "\\n"); say_ok(m, process.pid); return;',
        '    case "window": process.stderr.write("Error: early\\n"); for (let i = 1; i <= 30; i++) process.stderr.write("filler " + i + "\\n"); process.stderr.write("Error: edge\\n"); process.stderr.write("TypeError: late\\n"); for (let i = 1; i <= 19; i++) process.stderr.write("after " + i + "\\n"); end_in(100); return;',
        '    case "oomlong": process.stderr.write("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n"); for (let i = 1; i <= 40; i++) process.stderr.write(i + ": 0x101bda788 Builtins_JSEntryTrampoline [/usr/local/bin/node]\\n"); setTimeout(() => process.exit(134), 100); return;',
        '    case "oomshort": process.stderr.write("<--- Last few GCs --->\\n"); process.stderr.write("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\\n"); for (let i = 1; i <= 8; i++) process.stderr.write(i + ": 0x101bda788 Builtins_JSEntryTrampoline [/usr/local/bin/node]\\n"); setTimeout(() => process.exit(134), 100); return;',
        '    default: return say_ok(m, m.code);',
        '  }',
        '});',
      ]);
    }

    const started = () =>
      fs.existsSync(spawnLog)
        ? fs.readFileSync(spawnLog, 'utf8').split('\n').filter(Boolean).length
        : 0;
    const told = (text: string) =>
      errors.mock.calls.filter((call) => String(call[0]).includes(text));
    const engineOf = (reply: { body: string }) =>
      JSON.parse(reply.body).engine as string;

    /** An open event stream: what it was answered with and every event it has carried. */
    function openStream(
      port: number,
      headers: Record<string, string>
    ): Promise<{
      status: number;
      headers: http.IncomingHttpHeaders;
      events: Record<string, unknown>[];
      next: (
        match: (event: Record<string, unknown>) => boolean
      ) => Promise<Record<string, unknown>>;
      close: () => void;
    }> {
      return new Promise((resolve, reject) => {
        const events: Record<string, unknown>[] = [];
        const req = http.request(
          { host: '127.0.0.1', port, path: '/api/events', headers },
          (res) => {
            let buffer = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => {
              buffer += chunk;
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';
              for (const line of lines) if (line) events.push(JSON.parse(line));
            });
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              events,
              next: async (match) => {
                for (let i = 0; i < 100; i++) {
                  const found = events.find(match);
                  if (found) return found;
                  await new Promise((r) => setTimeout(r, 50));
                }
                throw new Error(`no such event: ${JSON.stringify(events)}`);
              },
              close: () => req.destroy(),
            });
          }
        );
        req.on('error', reject);
        req.end();
      });
    }

    it('says that it ended, replaces it, and says so once in the terminal (it is not "Internal error")', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate } = await startAndSignIn();
      const engine = engineOf(await session());
      const crashed = await evaluate(engine, 'crash');
      expect(crashed.status).toBe(503);
      expect(JSON.parse(crashed.body)).toEqual({
        error: `The console engine ended: RangeError: boom after start. ${NEXT_INPUT}`,
      });
      expect(told('The console engine ended')).toHaveLength(1);
      expect(String(told('The console engine ended')[0][0])).toContain(
        `The console engine ended: RangeError: boom after start. ${NEXT_INPUT}`
      );
      expect(told('could not start an engine')).toHaveLength(0);
      // the dead engine is forgotten: the next request does not meet it again
      const next = await evaluate(engine, 'who');
      expect(next.status).toBe(200);
      expect(started()).toBe(2);
    });

    it('ends the sentence of the reason once: a reason with a full stop gets no second one, one without gets one, a cut one gets none', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate } = await startAndSignIn();
      let engine = engineOf(await session());
      const how = async (code: string) => {
        const reply = await evaluate(engine, code);
        expect(reply.status).toBe(503);
        engine = (await evaluate(engine, 'who')).headers[
          'x-frodo-engine'
        ] as string;
        return JSON.parse(reply.body).error as string;
      };
      // a line that the process wrote: no full stop of its own
      expect(await how('crash')).toBe(
        `The console engine ended: RangeError: boom after start. ${NEXT_INPUT}`
      );
      // how the process ended: a sentence with its own full stop
      expect(await how('exit3')).toBe(
        `The console engine ended: The engine process ended with exit code 3. ${NEXT_INPUT}`
      );
      // a line cut to 200 characters ends in an ellipsis
      const cut = await how('longline');
      expect(cut).toMatch(
        /^The console engine ended: Error: x+… The next input/
      );
      expect(cut.endsWith(` ${NEXT_INPUT}`)).toBe(true);
      expect(cut).not.toContain('….');
      // a line that ends in another mark of the end of a sentence gets no full stop
      expect(await how('die:Error: boom!')).toBe(
        `The console engine ended: Error: boom! ${NEXT_INPUT}`
      );
      expect(await how('die:Error: what now?')).toBe(
        `The console engine ended: Error: what now? ${NEXT_INPUT}`
      );
      // a full stop inside the line is not the end of it
      expect(await how('die:Error: file.js failed')).toBe(
        `The console engine ended: Error: file.js failed. ${NEXT_INPUT}`
      );
    });

    it('serves the next two requests of a tab whose engine ended with one new engine, and names it in a header', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate } = await startAndSignIn();
      const up = await session();
      const first = engineOf(up);
      expect(up.headers['x-frodo-engine']).toBe(first);
      const crashed = await evaluate(first, 'crash');
      expect(crashed.status).toBe(503);
      // the engine that was just forgotten is not named again
      expect(crashed.headers['x-frodo-engine']).toBeUndefined();
      // the tab still holds the old id: this request gets a new engine and the tab is told which
      const again = await evaluate(first, 'who');
      expect(again.status).toBe(200);
      const second = again.headers['x-frodo-engine'] as string;
      expect(second).toMatch(/^[0-9a-f]{16}$/);
      expect(second).not.toBe(first);
      // the tab takes that id; its next request is served by the same engine
      const third = await evaluate(second, 'who');
      expect(third.status).toBe(200);
      expect(third.headers['x-frodo-engine']).toBe(second);
      expect(JSON.parse(third.body).result).toBe(JSON.parse(again.body).result);
      expect(started()).toBe(2);
    });

    it('answers every request that waits when the engine ends the same way, and says so once', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate } = await startAndSignIn();
      const engine = engineOf(await session());
      const [one, two] = await Promise.all([
        evaluate(engine, 'hang'),
        evaluate(engine, 'hang'),
      ]);
      for (const reply of [one, two]) {
        expect(reply.status).toBe(503);
        expect(JSON.parse(reply.body).error).toBe(
          `The console engine ended: RangeError: while busy. ${NEXT_INPUT}`
        );
      }
      expect(told('The console engine ended')).toHaveLength(1);
    });

    it('leaves the words to the answer of a request that waits, and does not repeat them on the stream', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate, headers } = await startAndSignIn();
      const engine = engineOf(await session());
      const stream = await openStream(web.port, {
        ...headers,
        'X-Frodo-Engine': engine,
      });
      try {
        const reply = await evaluate(engine, 'hang');
        expect(reply.status).toBe(503);
        // the engine's own error line is the only log event; a late one would
        // have come by now (the end is told in the same moment)
        await stream.next(
          (e) => e.type === 'log' && e.text === 'RangeError: while busy'
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(
          stream.events.filter((e) =>
            String(e.text ?? '').startsWith('The console engine ended')
          )
        ).toEqual([]);
      } finally {
        stream.close();
      }
    });

    it('says nothing of an end that the console asked for, though a request waits for the engine', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate } = await startAndSignIn();
      const engine = engineOf(await session());
      const waiting = evaluate(engine, 'wait').catch((e) => e);
      // the request is with the engine now
      await new Promise((resolve) => setTimeout(resolve, 300));
      const pid = Number(
        fs.readFileSync(spawnLog, 'utf8').trim().split('\n').pop()
      );
      await web.close();
      await waiting;
      // the process is gone and its end has been seen
      for (let i = 0; i < 100; i++) {
        try {
          process.kill(pid, 0);
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(told('The console engine ended')).toHaveLength(0);
    });

    it('says nothing of an end that the idle shutdown asked for, though a request waits for the engine', async () => {
      // only the clock of the idle check is a fake one
      jest.useFakeTimers({
        doNotFake: [
          'hrtime',
          'nextTick',
          'performance',
          'queueMicrotask',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'requestIdleCallback',
          'cancelIdleCallback',
          'setImmediate',
          'clearImmediate',
          'setTimeout',
          'clearTimeout',
        ],
      });
      try {
        process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
        const { session, evaluate } = await startAndSignIn();
        const engine = engineOf(await session());
        const waiting = evaluate(engine, 'wait').catch((e) => e);
        // the request is with the engine now
        await new Promise((resolve) => setTimeout(resolve, 300));
        const pid = Number(
          fs.readFileSync(spawnLog, 'utf8').trim().split('\n').pop()
        );
        // no browser has been seen for longer than the idle limit: the console shuts down
        jest.advanceTimersByTime(40 * 60 * 1000);
        await waiting;
        for (let i = 0; i < 100; i++) {
          try {
            process.kill(pid, 0);
          } catch {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        // the engine was ended by the shutdown (the process is gone) and nobody was told
        expect(() => process.kill(pid, 0)).toThrow();
        expect(told('The console engine ended')).toHaveLength(0);
      } finally {
        jest.useRealTimers();
      }
    });

    it('says nothing of an engine that was ended before it answered either, when the console asked for it', async () => {
      // a worker that never answers and ends when it is told to
      spawnLog = path.join(dir, 'spawns.log');
      process.env.FRODO_TEST_WORKER_SCRIPT = stub([
        `require("node:fs").appendFileSync(${JSON.stringify(spawnLog)}, process.pid + "\\n");`,
        'require("node:readline").createInterface({ input: process.stdin }).on("line", (line) => {',
        '  if (JSON.parse(line).op === "dispose") process.exit(0);',
        '});',
      ]);
      const { session } = await startAndSignIn();
      const waiting = session().catch((e) => e);
      await new Promise((resolve) => setTimeout(resolve, 500));
      const pid = Number(
        fs.readFileSync(spawnLog, 'utf8').trim().split('\n').pop()
      );
      await web.close();
      await waiting;
      for (let i = 0; i < 100; i++) {
        try {
          process.kill(pid, 0);
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(() => process.kill(pid, 0)).toThrow();
      // neither as a failure to start nor as an end
      expect(told('could not start an engine')).toHaveLength(0);
      expect(told('The console engine ended')).toHaveLength(0);
    });

    it('forgets only the engine that ended: another tab keeps its engine, what it remembers and its stream', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate, headers } = await startAndSignIn();
      // two tabs, each with an engine of its own
      const tabA = engineOf(await session());
      const tabB = engineOf(await session());
      expect(tabB).not.toBe(tabA);
      expect(started()).toBe(2);
      expect((await evaluate(tabB, 'keep:blue')).status).toBe(200);
      const pidB = JSON.parse((await evaluate(tabB, 'who')).body).result;
      const stream = await openStream(web.port, {
        ...headers,
        'X-Frodo-Engine': tabB,
      });
      try {
        // tab A's engine ends
        expect((await evaluate(tabA, 'crash')).status).toBe(503);
        // tab B goes on with the same engine: its id, its process, what it remembers
        const kept = await evaluate(tabB, 'kept');
        expect(kept.status).toBe(200);
        expect(kept.headers['x-frodo-engine']).toBe(tabB);
        expect(JSON.parse(kept.body).result).toBe('blue');
        expect(JSON.parse((await evaluate(tabB, 'who')).body).result).toBe(
          pidB
        );
        // and its stream still carries what its engine logs
        expect((await evaluate(tabB, 'say')).status).toBe(200);
        await stream.next(
          (e) => e.type === 'log' && e.text === 'hello from the engine'
        );
        // no engine was started for tab B, and none yet for tab A
        expect(started()).toBe(2);
      } finally {
        stream.close();
      }
    });

    it('binds the event stream of a tab with an id that no engine has to the engine that it starts for it', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { evaluate, headers } = await startAndSignIn();
      const stream = await openStream(web.port, {
        ...headers,
        'X-Frodo-Engine': '0123456789abcdef',
      });
      try {
        expect(stream.status).toBe(200);
        const engine = stream.headers['x-frodo-engine'] as string;
        expect(engine).toMatch(/^[0-9a-f]{16}$/);
        expect(engine).not.toBe('0123456789abcdef');
        // what the new engine logs reaches this stream, not only the global bus
        expect((await evaluate(engine, 'say')).status).toBe(200);
        await stream.next(
          (e) => e.type === 'log' && e.text === 'hello from the engine'
        );
        expect(started()).toBe(1);
      } finally {
        stream.close();
      }
    });

    it('says so again when another engine ends with the same words', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate } = await startAndSignIn();
      const first = engineOf(await session());
      expect((await evaluate(first, 'crash')).status).toBe(503);
      const replacement = (await evaluate(first, 'who')).headers[
        'x-frodo-engine'
      ] as string;
      expect((await evaluate(replacement, 'crash')).status).toBe(503);
      expect(told('boom after start')).toHaveLength(2);
      expect(started()).toBe(2);
    });

    it('names the engine in a header on every answer of an engine: the event stream and an error answer too', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, headers, host } = await startAndSignIn();
      const engine = engineOf(await session());
      const stream = await openStream(web.port, {
        ...headers,
        'X-Frodo-Engine': engine,
      });
      try {
        expect(stream.status).toBe(200);
        expect(stream.headers['x-frodo-engine']).toBe(engine);
      } finally {
        stream.close();
      }
      const refused = await request(web.port, {
        method: 'POST',
        path: '/api/eval',
        headers: {
          ...headers,
          Origin: `http://${host}`,
          'Content-Type': 'application/json',
          'X-Frodo-Engine': engine,
        },
        body: JSON.stringify({ code: '' }),
      });
      expect(refused.status).toBe(400);
      expect(refused.headers['x-frodo-engine']).toBe(engine);
    });

    it('names no engine when the console runs on one shared engine', async () => {
      const { session } = await startAndSignIn({
        engine: withInfo(fakeEngine(), () => ({})),
      });
      const reply = await session();
      expect(reply.status).toBe(200);
      expect(reply.headers['x-frodo-engine']).toBeUndefined();
      expect(JSON.parse(reply.body).engine).toBeUndefined();
    });

    it('puts the end of an engine on the event streams of its tab, even when no request waits', async () => {
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate, headers } = await startAndSignIn();
      const engine = engineOf(await session());
      const stream = await openStream(web.port, {
        ...headers,
        'X-Frodo-Engine': engine,
      });
      try {
        // answers, then ends 150 ms later
        expect((await evaluate(engine, 'idle')).status).toBe(200);
        // the line that the engine wrote comes first, as it always does
        const event = await stream.next(
          (e) =>
            e.type === 'log' &&
            String(e.text).startsWith('The console engine ended')
        );
        expect(event.text).toBe(
          `The console engine ended: RangeError: while idle. ${NEXT_INPUT}\n`
        );
        // nobody asked for anything: the terminal is told with the next request
        expect(told('The console engine ended')).toHaveLength(0);
      } finally {
        stream.close();
      }
    });

    it('leaves the three secrets of this server out of the words of an engine that ended, as it does for one that never came up', async () => {
      const real = crypto.randomBytes.bind(crypto);
      const fills = [1, 2, 3];
      jest
        .spyOn(crypto, 'randomBytes')
        .mockImplementation(((size: number) =>
          size === 32
            ? Buffer.alloc(32, fills.shift() ?? 4)
            : real(size)) as typeof crypto.randomBytes);
      process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
      const { session, evaluate, secrets } = await startAndSignIn();
      const leaked = [secrets.link, secrets.session, secrets.csrf];
      for (const value of leaked) expect(value).not.toMatch(/\d/);
      process.env.TEST_LEAK = leaked.join(' ');
      try {
        const engine = engineOf(await session());
        const reply = await evaluate(engine, 'leak');
        expect(reply.status).toBe(503);
        for (const value of leaked) {
          expect(reply.body).not.toContain(value);
          expect(JSON.stringify(errors.mock.calls)).not.toContain(value);
        }
        expect(reply.body).toContain('<redacted>');
      } finally {
        delete process.env.TEST_LEAK;
      }
    });

    describe('the words that say how', () => {
      /** An engine of the stub that has answered once, so that it counts as started. */
      async function started_engine() {
        process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
        const engine = await spawnTabEngine();
        await engine.info();
        return engine;
      }

      it('are the exit code of a process that wrote nothing, without "before it answered"', async () => {
        const engine = await started_engine();
        const error = await engine.evaluate('exit3').catch((e) => e);
        expect(error).not.toBeInstanceOf(TabEngineStartError);
        expect(error.message).toBe(
          'The engine process ended with exit code 3.'
        );
      });

      it('are the signal of a process that was stopped', async () => {
        const engine = await started_engine();
        const error = await engine.evaluate('kill').catch((e) => e);
        expect(error).not.toBeInstanceOf(TabEngineStartError);
        expect(error.message).toBe(
          'The engine process was stopped by the signal SIGKILL.'
        );
      });

      it('are an old error line of the engine never: only what it wrote since it last answered counts', async () => {
        const engine = await started_engine();
        // an error line that it wrote while it answered, long ago
        await engine.evaluate('warn');
        await engine.evaluate('who');
        const error = await engine.evaluate('kill').catch((e) => e);
        expect(error.message).not.toContain('sign-in failed');
        expect(error.message).toBe(
          'The engine process was stopped by the signal SIGKILL.'
        );
      });

      it('are the line that names an error among what it wrote while it worked, though the process wrote more than twenty lines', async () => {
        const engine = await started_engine();
        const error = await engine.evaluate('spam').catch((e) => e);
        expect(error.message).toBe('TypeError: the last one');
      });

      it('leave out the secrets that the server names, in the error and in the line that the streams get', async () => {
        process.env.FRODO_TEST_WORKER_SCRIPT = answeringStub();
        process.env.TEST_LEAK = 'abcdefghijklmnop';
        const spawnWithSecret = async () =>
          (await spawnTabEngine(undefined, {
            secrets: ['abcdefghijklmnop'],
          })) as TabEngine & {
            onLog: (fn: (text: string) => void) => () => void;
          };
        try {
          const waiting = await spawnWithSecret();
          await waiting.info();
          const error = await waiting.evaluate('leak').catch((e) => e);
          expect(error.message).toBe('Error: leaked <redacted>');
          // an engine that ends while nothing waits for it: the streams are told
          const idle = await spawnWithSecret();
          await idle.info();
          const lines: string[] = [];
          idle.onLog((text) => lines.push(text));
          await idle.evaluate('leakidle');
          for (let i = 0; i < 100 && lines.length < 2; i++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          expect(
            lines.filter((line) => line.startsWith('The console engine ended'))
          ).toEqual([
            `The console engine ended: Error: leaked <redacted>. ${NEXT_INPUT}\n`,
          ]);
        } finally {
          delete process.env.TEST_LEAK;
        }
      });

      it('are how the process ended, not a line of a native trace, when no line names an error', async () => {
        const engine = await started_engine();
        const error = await engine.evaluate('oomlong').catch((e) => e);
        expect(error).not.toBeInstanceOf(TabEngineStartError);
        expect(error.message).toBe(
          'The engine process ended with exit code 134.'
        );
      });

      it('are the line that names a fatal error, when it is among the last lines', async () => {
        const engine = await started_engine();
        const error = await engine.evaluate('oomshort').catch((e) => e);
        expect(error.message).toBe(
          'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'
        );
      });

      it('are taken from the last twenty lines that the process wrote: an early error line is gone, a late one stays', async () => {
        const engine = await started_engine();
        // 'Error: early', thirty lines and 'Error: edge' (the 21st from the
        // end) scroll out; 'TypeError: late' is the first of the twenty that stay
        const error = await engine.evaluate('window').catch((e) => e);
        expect(error.message).toBe('TypeError: late');
      });

      it('are told to the streams only when the end was not asked for', async () => {
        const engine = (await started_engine()) as TabEngine & {
          onLog: (fn: (text: string) => void) => () => void;
        };
        const pid = Number(
          fs.readFileSync(spawnLog, 'utf8').trim().split('\n').pop()
        );
        const lines: string[] = [];
        engine.onLog((text) => lines.push(text));
        engine.dispose();
        // no request waits: the process is gone, and the streams hear nothing
        for (let i = 0; i < 100; i++) {
          try {
            process.kill(pid, 0);
          } catch {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
        expect(lines).toEqual([]);
        await expect(engine.info()).rejects.toThrow(
          'The engine process ended with exit code 0.'
        );
      });

      it('are, for an engine that never answered, still the first lines that it wrote', async () => {
        process.env.FRODO_TEST_WORKER_SCRIPT = stub([
          'process.stderr.write("Error: how it began\\n");',
          'for (let i = 1; i <= 30; i++) process.stderr.write("later line " + i + "\\n");',
          'process.stderr.write("TypeError: how it ended\\n");',
          'process.exit(1);',
        ]);
        const engine = await spawnTabEngine();
        const error = await engine.info().catch((e) => e);
        expect(error).toBeInstanceOf(TabEngineStartError);
        expect(error.message).toBe('Error: how it began');
      });
    });
  });
});

describe('the sign-in callback', () => {
  let web: WebConsoleHandle;
  const signedIn = jest.fn();

  beforeEach(async () => {
    signedIn.mockClear();
    web = await startWebConsole({
      engine: withInfo(fakeEngine(), () => ({})),
      logs: createLogBus(),
      sessionInfo: () => ({}),
      onSignIn: signedIn,
    });
  });

  afterEach(async () => {
    await web.close();
  });

  const use = (token: string) =>
    request(web.port, {
      path: `/?t=${token}`,
      headers: { Host: `127.0.0.1:${web.port}` },
    });

  it('is called once, when the link is used for the first time', async () => {
    const token = new URL(web.launchUrl).searchParams.get('t')!;
    expect(signedIn).not.toHaveBeenCalled();
    expect((await use(token)).status).toBe(200);
    expect(signedIn).toHaveBeenCalledTimes(1);
    // a second use is refused and tells nobody
    expect((await use(token)).status).toBe(403);
    expect(signedIn).toHaveBeenCalledTimes(1);
  });

  it('is not called for a try that is refused', async () => {
    expect((await use('not-the-token')).status).toBe(403);
    expect(
      (await request(web.port, { headers: { Host: `127.0.0.1:${web.port}` } }))
        .status
    ).toBe(401);
    expect(signedIn).not.toHaveBeenCalled();
  });

  it('never breaks the sign-in, whatever the callback does', async () => {
    signedIn.mockImplementationOnce(() => {
      throw new Error('the terminal is gone');
    });
    const token = new URL(web.launchUrl).searchParams.get('t')!;
    const reply = await use(token);
    expect(reply.status).toBe(200);
    expect(String(reply.headers['set-cookie']?.[0])).toContain('HttpOnly');
    // the link is used, once
    expect((await use(token)).status).toBe(403);
  });

  it('is told nothing of the link', async () => {
    const token = new URL(web.launchUrl).searchParams.get('t')!;
    await use(token);
    expect(signedIn.mock.calls[0]).toEqual([]);
  });
});

describe('the pause of a page that cannot get a session', () => {
  it('doubles from the first pause up to the cap, and stays there', () => {
    const pause = createRetryPause(1500, 30000);
    expect(Array.from({ length: 8 }, () => pause.next())).toEqual([
      1500, 3000, 6000, 12000, 24000, 30000, 30000, 30000,
    ]);
  });

  it('starts over at the first pause after a success', () => {
    const pause = createRetryPause(1500, 30000);
    pause.next();
    pause.next();
    pause.next();
    pause.reset();
    expect(pause.next()).toBe(1500);
    expect(pause.next()).toBe(3000);
  });

  describe('as the page carries it', () => {
    // The page holds the source of the function and the numbers it is called
    // with. These tests run that very text, not the TypeScript beside it.
    const page = renderConsolePage({ nonce: 'abc', csrf: 'def' });
    const carried = page
      .split('// retry-pause:begin')[1]
      .split('// retry-pause:end')[0];

    it('waits 1.5 s, then 3 s, and never more than 30 s', () => {
      const pause = vm.runInNewContext(`${carried}\nsessionRetry`);
      expect(Array.from({ length: 8 }, () => pause.next())).toEqual([
        1500, 3000, 6000, 12000, 24000, 30000, 30000, 30000,
      ]);
      pause.reset();
      expect(pause.next()).toBe(1500);
    });

    it('resets the pause when a session was got and waits that long when it was not', () => {
      expect(page).toMatch(
        /refreshSession\(\)\.then\(function \(\) \{\s*sessionRetry\.reset\(\);\s*listen\(\);/
      );
      expect(page).toMatch(/setTimeout\(listen, sessionRetry\.next\(\)\);/);
    });
  });
});

describe('the engine of a tab, as the page carries it', () => {
  // The page holds the source of these functions. These tests run that very
  // text, with the parts of the browser that it touches replaced.
  const page = renderConsolePage({ nonce: 'abc', csrf: 'def' });
  const carried = () =>
    page.split('// engine-id:begin')[1].split('// engine-id:end')[0];

  /** The page's engine id and stream, as a test can look at them. */
  function pageWith(engine: string | null) {
    const stored: Record<string, string> = {};
    const aborted = jest.fn();
    const context = vm.createContext({
      sessionStorage: {
        setItem: (key: string, value: string) => {
          stored[key] = value;
        },
      },
      aborted,
    });
    vm.runInContext(
      `var engineId = ${JSON.stringify(engine)}; var sharedEngine = false;\n${carried()}\nstreamAbort = { abort: function () { aborted(); } };`,
      context
    );
    return {
      stored,
      aborted,
      engineId: () => vm.runInContext('engineId', context),
      // an answer of the server that names `header` as the engine
      learn: (header: string | null, ownStream: boolean) => {
        context.answer = {
          headers: {
            get: (name: string) =>
              name.toLowerCase() === 'x-frodo-engine' ? header : null,
          },
        };
        vm.runInContext(`learnEngine(answer, ${ownStream})`, context);
      },
    };
  }

  it('takes the id that an answer names, keeps it for the tab and drops the stream of the old engine', () => {
    const tab = pageWith('old');
    tab.learn('new', false);
    expect(tab.engineId()).toBe('new');
    expect(tab.stored['frodo-engine-id']).toBe('new');
    expect(tab.aborted).toHaveBeenCalledTimes(1);
  });

  it('keeps the stream that was opened for the engine it learns of', () => {
    const tab = pageWith('old');
    tab.learn('new', true);
    expect(tab.engineId()).toBe('new');
    expect(tab.stored['frodo-engine-id']).toBe('new');
    expect(tab.aborted).not.toHaveBeenCalled();
  });

  it('does nothing for the id it holds, for an answer without one, or for the first id', () => {
    const tab = pageWith('same');
    tab.learn('same', false);
    tab.learn(null, false);
    expect(tab.engineId()).toBe('same');
    expect(tab.aborted).not.toHaveBeenCalled();
    const first = pageWith(null);
    first.learn('first', false);
    expect(first.engineId()).toBe('first');
    expect(first.aborted).not.toHaveBeenCalled();
  });

  it('is wired into every request of the page and into its event stream', () => {
    expect(page).toMatch(
      /fetch\(path, opts\)\.then\(function \(r\) \{\s*learnEngine\(r, false\);/
    );
    expect(page).toMatch(
      /streamAbort = new AbortController\(\);\s*fetch\('\/api\/events', \{[^}]*signal: streamAbort\.signal/
    );
    expect(page).toMatch(/learnEngine\(r, true\);/);
  });
});

describe('buildContentSecurityPolicy', () => {
  it('allows only the nonce by default', () => {
    const csp = buildContentSecurityPolicy('abc123');
    expect(csp).toContain("script-src 'nonce-abc123'");
    expect(csp).toContain("style-src 'nonce-abc123'");
  });

  it('allows external files one exact URL at a time', () => {
    const csp = buildContentSecurityPolicy('abc123', {
      scripts: ['https://cdnjs.cloudflare.com/ajax/libs/x/1.0.0/x.min.js'],
      styles: ['https://cdnjs.cloudflare.com/ajax/libs/x/1.0.0/x.min.css'],
    });
    expect(csp).toContain(
      "script-src 'nonce-abc123' https://cdnjs.cloudflare.com/ajax/libs/x/1.0.0/x.min.js;"
    );
    expect(csp).not.toMatch(/https:\/\/cdnjs\.cloudflare\.com(;|\s|$)/);
  });

  it('refuses a source that could smuggle in another directive or a weaker scheme', () => {
    for (const bad of [
      "https://a.example.com/x.js; script-src 'unsafe-inline'",
      'http://a.example.com/x.js',
      'https://a.example.com/x.js https://b.example.com/y.js',
      "'unsafe-inline'",
      '*',
    ]) {
      expect(() =>
        buildContentSecurityPolicy('abc123', { scripts: [bad] })
      ).toThrow();
    }
  });

  it('refuses a nonce that is not a plain token', () => {
    expect(() => buildContentSecurityPolicy("a'; script-src *")).toThrow();
  });
});
