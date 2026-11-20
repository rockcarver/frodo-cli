import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { frodo } from '@rockcarver/frodo-lib';
import { WebEngine } from './ShellWebEngineOps';
import { buildContentSecurityPolicy, renderConsolePage } from './ShellWebPage';
import {
  createLogBus,
  LogBus,
  SessionInfo,
  startWebConsole,
  WebConsoleHandle,
} from './ShellWebServerOps';

/**
 * Security tests for the web console's local server. Whoever can talk to it
 * can run code with the connected environment's credentials, so each check
 * the server claims is attacked here with a forged request. Plain
 * http.request is used throughout: fetch will not let a test set the Host or
 * Origin headers, which are exactly what an attacker controls.
 */

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
    expect(redeem.status).toBe(302);
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
      expect(reply.status).toBe(302);
      expect(reply.headers.location).toBe('/');
      const cookie = String(reply.headers['set-cookie']?.[0]);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
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
    expect(redeem.status).toBe(302);
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
          // The stream is open: now the worker speaks, and both channels
          // must land in it.
          http
            .request(
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
              }
            )
            .end(JSON.stringify({ code: 'speak' }));
        });
        await streaming;
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
