import { ChildProcess, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { frodo } from '@rockcarver/frodo-lib';
import { WebEngine } from './ShellWebEngineOps';
import {
  buildContentSecurityPolicy,
  ContentSecurityPolicyOptions,
  ExternalAsset,
  renderConsolePage,
} from './ShellWebPage';
import { createRemoteRegistry } from './ShellWebSerializeOps';

/**
 * The local web server behind `frodo shell --web`.
 *
 * Whoever can send this server a request can run code with the connected
 * environment's credentials, exactly as if they typed it in the terminal. A
 * listening port is therefore a privileged one (compare the MCP server,
 * decision record 0021), and every request passes the same checks in the
 * same order before any route runs:
 *
 *  1. The socket is bound to the loopback address only.
 *  2. The `Host` header must name this server. A page on another site that
 *     has been re-pointed (DNS rebinding) at 127.0.0.1 sends its own host
 *     name, and is refused.
 *  3. An `Origin` header, when present, must be this server's own origin.
 *  4. A browser signs in once with a one-time link whose secret is swapped
 *     for an HttpOnly, SameSite=Strict cookie; the link is then dead.
 *  5. Every API call needs that cookie AND a per-session secret in a custom
 *     header, which another site cannot send without a CORS preflight this
 *     server never grants. Writes must also be JSON and carry an Origin.
 *
 * Secrets are never logged and are compared in constant time.
 */

const LOOPBACK = '127.0.0.1';
const COOKIE = 'frodo_console_session';
const CSRF_HEADER = 'x-frodo-csrf';
const BODY_LIMIT = 1024 * 1024;
const MAX_ACTIVE_REQUESTS = 64;
const MAX_STREAMS = 8;
const HEARTBEAT_MS = 15_000;

export type LogBus = {
  publish(text: string): void;
  subscribe(listener: (text: string) => void): () => void;
};

/** Fan-out of script output to every browser stream that is listening. */
export function createLogBus(): LogBus {
  const listeners = new Set<(text: string) => void>();
  return {
    publish(text) {
      for (const listener of listeners) listener(text);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** One tab's engine, in this process or a child one. */
export type TabEngine = {
  evaluate(code: string): Promise<{
    status: 'ok' | 'error' | 'incomplete';
    result?: unknown;
    name?: string;
    message?: string;
  }>;
  children(id: number, offset: number, limit: number): Promise<unknown | null>;
  json(id: number): Promise<unknown | null>;
  complete(line: string): Promise<[string[], string]>;
  history(): Promise<string[]>;
  connect(host: string): Promise<{ ok: boolean; info: SessionInfo }>;
  /** The connection as this engine's own process sees it. */
  info(): Promise<SessionInfo>;
  /** Wipe the user's JS namespace; connection and history survive. */
  reset(): Promise<void>;
  dispose(): void;
};

export type SessionInfo = {
  host?: string;
  realm?: string;
  username?: string;
  deploymentType?: string;
  /** Which saved credential the login used ('user', 'svcacct', 'browser'). */
  credentialSource?: string;
};

export type WebConsoleOptions = {
  /**
   * One shared engine for every tab. Omit it to give each tab its own
   * engine process (and its own environment): the worker entry is spawned
   * per tab, keyed by an id the tab keeps in its sessionStorage.
   */
  engine?: WebEngine;
  logs: LogBus;
  sessionInfo: () => SessionInfo;
  /** Spawn one engine process; defaults to the bundled worker entry. */
  spawnEngine?: () => Promise<TabEngine>;
  /** Port to listen on; 0 (the default) picks a free one. */
  port?: number;
  /** Exact external resources the page may load; see the CSP builder. */
  contentSecurityPolicy?: ContentSecurityPolicyOptions;
  /**
   * Pinned external resources the page loads by tag (script and link
   * elements with integrity hashes). Their URLs must also appear in
   * `contentSecurityPolicy`, or the browser refuses them twice over.
   */
  assets?: { scripts: ExternalAsset[]; styles: ExternalAsset[] };
  /**
   * Connect the console to a saved connection profile at the person's
   * request (the page's picker). Returns false when the login fails; the
   * console stays disconnected and the page says so.
   */
  connect?: (host: string) => Promise<boolean>;
};

export type WebConsoleHandle = {
  /** Where the server listens. Always the loopback address. */
  address: string;
  port: number;
  /**
   * The one-time sign-in link. It holds a secret: show it to the person who
   * started the console, never log it, and never write it to a file.
   */
  launchUrl: string;
  close(): Promise<void>;
};

/** Saved profile hosts, for validating what the page may pick. */
function savedProfileHosts(): Set<string> {
  const filename = frodo.conn.getConnectionProfilesPath();
  try {
    const data = JSON.parse(fs.readFileSync(filename, 'utf8')) as Record<
      string,
      unknown
    >;
    return new Set(Object.keys(data));
  } catch {
    return new Set();
  }
}

/** One picker row: where to connect and what will happen on connect. */
export type ProfileSummary = {
  host: string;
  alias?: string;
  /** True when this profile's saved preference logs in through a browser. */
  browserLogin?: boolean;
};

/**
 * Hosts and aliases only: profile secrets never reach the page. The one
 * extra flag says whose connect will open a browser (a profile saved with
 * the browser as its preferred credential and no other usable credential),
 * so the picker can say so before the click instead of after.
 */
function savedProfileSummaries(): ProfileSummary[] {
  const filename = frodo.conn.getConnectionProfilesPath();
  try {
    const data = JSON.parse(fs.readFileSync(filename, 'utf8')) as Record<
      string,
      { alias?: string; defaultCredential?: string; svcacctId?: string }
    >;
    return Object.entries(data).map(([host, profile]) => ({
      host,
      alias: profile.alias,
      browserLogin:
        profile.defaultCredential === 'browser' && !profile.svcacctId,
    }));
  } catch {
    return [];
  }
}

/**
 * The worker entry inside the bundle; tsdown emits it under cli/shell.
 * Tests point the env var at a stub so the real spawn path (protocol,
 * stderr forwarding) runs without the bundle present.
 */
function workerScriptPath(): string {
  if (process.env.FRODO_TEST_WORKER_SCRIPT) {
    return process.env.FRODO_TEST_WORKER_SCRIPT;
  }
  // src/ops/ShellWebServerOps.ts compiles into dist/ (flat), while the
  // worker entry keeps its source layout: dist/cli/shell/.
  return path.join(__dirname, 'cli', 'shell', 'engine-worker.cjs');
}

/** Spawn one engine child and wrap its JSON-line protocol. */
export async function spawnTabEngine(
  custom?: () => Promise<TabEngine>
): Promise<TabEngine> {
  if (custom) return custom();
  const child: ChildProcess = spawn(process.execPath, [workerScriptPath()], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;
  const logListeners = new Set<(text: string) => void>();
  // The worker's own messages (the browser-login notice, sign-in failures)
  // go to its stderr; a browser tab would otherwise never see why a connect
  // opened a browser. Each stderr line joins the tab's log stream as-is;
  // it is diagnostics, never protocol (protocol is stdout's JSON lines).
  createInterface({ input: child.stderr! }).on('line', (line) => {
    for (const listener of logListeners) listener(line);
  });
  const readline = createInterface({ input: child.stdout! });
  readline.on('line', (line) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof message.log === 'string') {
      for (const listener of logListeners) listener(message.log as string);
      return;
    }
    const id = message.id as number | undefined;
    if (id !== undefined && pending.has(id)) {
      const p = pending.get(id)!;
      pending.delete(id);
      if (message.error !== undefined) {
        p.reject(new Error(String(message.error)));
      } else {
        p.resolve(message);
      }
    }
  });
  const request = (payload: Record<string, unknown>): Promise<any> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin!.write(`${JSON.stringify({ ...payload, id })}
`);
    });
  child.on('exit', () => {
    for (const p of pending.values()) p.reject(new Error('Engine exited'));
    pending.clear();
  });
  return {
    async evaluate(code) {
      const reply = await request({ op: 'eval', code });
      return reply.outcome;
    },
    async children(id, offset, limit) {
      const reply = await request({ op: 'children', id2: id, offset, limit });
      return reply.page;
    },
    async json(id) {
      const reply = await request({ op: 'json', id2: id });
      return reply.json;
    },
    async complete(line) {
      const reply = await request({ op: 'complete', line });
      return [reply.candidates, reply.replace];
    },
    async history() {
      const reply = await request({ op: 'history' });
      return reply.lines;
    },
    async connect(host) {
      const reply = await request({ op: 'connect', host });
      return { ok: reply.ok, info: reply.info };
    },
    async info() {
      const reply = await request({ op: 'info' });
      return reply.info;
    },
    async reset() {
      await request({ op: 'reset' });
    },
    dispose() {
      try {
        child.stdin!.write(`${JSON.stringify({ op: 'dispose' })}
`);
      } catch {
        child.kill('SIGTERM');
      }
    },
    // Exposed for openEvents to subscribe this tab's log stream.
    ...({
      onLog: (fn: (text: string) => void) => {
        logListeners.add(fn);
        return () => logListeners.delete(fn);
      },
    } as object),
  } as TabEngine & {
    onLog: (fn: (text: string) => void) => () => void;
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function secret(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** Constant-time comparison that does not leak the length of the secret. */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) =>
    crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return cookies;
}

function readBody(req: http.IncomingMessage): Promise<Buffer | 'too-large'> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > BODY_LIMIT) {
      resolve('too-large');
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        over = true;
        chunks.length = 0;
        resolve('too-large');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!over) resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

export async function startWebConsole(
  options: WebConsoleOptions
): Promise<WebConsoleHandle> {
  const launchToken = secret();
  let launchUsed = false;
  const sessionSecret = secret();
  const csrf = secret();
  const registry = createRemoteRegistry();
  const streams = new Set<http.ServerResponse>();
  let active = 0;
  let port = 0;
  let connecting = false;

  // Engines: the shared one when options.engine is given, otherwise one
  // child process per tab, keyed by the tab's engine id.
  const engines = new Map<string, TabEngine>();
  const shared: TabEngine | undefined = options.engine
    ? {
        evaluate: async (code) => {
          const outcome = await options.engine!.evaluate(code);
          if (outcome.status === 'ok') {
            return {
              status: 'ok',
              result: registry.describeResult(outcome.value),
            };
          }
          if (outcome.status === 'error') {
            const e = outcome.error as Error;
            return { status: 'error', name: e?.name, message: e?.message };
          }
          return { status: 'incomplete' };
        },
        children: async (id, offset, limit) =>
          registry.children(id, offset, limit) ?? null,
        json: async (id) => registry.json(id) ?? null,
        complete: async (line) => options.engine!.complete(line),
        history: async () => options.engine!.history(),
        connect: async (host) => {
          if (!options.connect)
            return { ok: false, info: options.sessionInfo() };
          const ok = await options.connect(host);
          return { ok, info: options.sessionInfo() };
        },
        info: async () => options.sessionInfo(),
        reset: async () => options.engine!.reset(),
        dispose: () => options.engine!.dispose(),
      }
    : undefined;

  const allowedHosts = () =>
    new Set([`${LOOPBACK}:${port}`, `localhost:${port}`]);
  const allowedOrigins = () =>
    new Set([`http://${LOOPBACK}:${port}`, `http://localhost:${port}`]);

  const baseHeaders: Record<string, string> = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
  };

  function send(
    res: http.ServerResponse,
    status: number,
    body: string,
    contentType: string,
    extra: Record<string, string | string[]> = {}
  ): void {
    res.writeHead(status, {
      ...baseHeaders,
      'Content-Type': contentType,
      'Content-Length': Buffer.byteLength(body),
      ...extra,
    });
    res.end(body);
  }
  const sendJson = (
    res: http.ServerResponse,
    status: number,
    value: unknown,
    extra: Record<string, string | string[]> = {}
  ) =>
    send(
      res,
      status,
      JSON.stringify(value),
      'application/json; charset=utf-8',
      extra
    );

  function hasSession(req: http.IncomingMessage): boolean {
    const cookie = parseCookies(req.headers.cookie)[COOKIE];
    return typeof cookie === 'string' && safeEqual(cookie, sessionSecret);
  }

  function hasCsrf(req: http.IncomingMessage): boolean {
    const sent = req.headers[CSRF_HEADER];
    return typeof sent === 'string' && safeEqual(sent, csrf);
  }

  function servePage(res: http.ServerResponse): void {
    const nonce = crypto.randomBytes(16).toString('base64url');
    send(
      res,
      200,
      renderConsolePage({ nonce, csrf, assets: options.assets }),
      'text/html; charset=utf-8',
      {
        'Content-Security-Policy': buildContentSecurityPolicy(
          nonce,
          options.contentSecurityPolicy
        ),
      }
    );
  }

  async function readJson(req: http.IncomingMessage): Promise<unknown> {
    if (!/^application\/json\b/i.test(String(req.headers['content-type']))) {
      throw new HttpError(415, 'Content-Type must be application/json');
    }
    const body = await readBody(req);
    if (body === 'too-large') throw new HttpError(413, 'Request too large');
    try {
      return JSON.parse(body.toString('utf8'));
    } catch {
      throw new HttpError(400, 'Invalid JSON');
    }
  }

  function openEvents(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): void {
    if (streams.size >= MAX_STREAMS) {
      throw new HttpError(503, 'Too many event streams');
    }
    res.writeHead(200, {
      ...baseHeaders,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      Connection: 'keep-alive',
    });
    const write = (event: unknown) => {
      if (res.writable) res.write(`${JSON.stringify(event)}\n`);
    };
    write({ type: 'ready' });
    streams.add(res);
    // A tab's stream carries that tab's engine output; the shared engine
    // publishes on the shared bus.
    const unsubscribe =
      (
        engineForSync(req) as
          | (TabEngine & {
              onLog?: (fn: (text: string) => void) => () => void;
            })
          | undefined
      )?.onLog?.((text) => write({ type: 'log', text })) ??
      options.logs.subscribe((text) => write({ type: 'log', text }));
    const beat = setInterval(() => write({ type: 'ping' }), HEARTBEAT_MS);
    res.on('close', () => {
      clearInterval(beat);
      unsubscribe();
      streams.delete(res);
    });
  }

  /** The engine a request belongs to, without spawning one. */
  function engineForSync(req: http.IncomingMessage): TabEngine | undefined {
    if (shared) return shared;
    return engines.get(String(req.headers['x-frodo-engine'] ?? ''));
  }

  async function api(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    path: string
  ): Promise<void> {
    if (!hasSession(req) || !hasCsrf(req)) {
      throw new HttpError(401, 'Not signed in');
    }
    noteBrowserActivity();
    // A tab without an engine id gets one now (its first /api/session
    // call): the id travels in the response and every later request of
    // that tab carries it, so its engine process stays its own.
    let engineId = shared
      ? undefined
      : String(req.headers['x-frodo-engine'] ?? '');
    if (!shared && !engines.has(engineId)) {
      engineId = crypto.randomBytes(8).toString('hex');
      engines.set(engineId, await spawnTabEngine(options.spawnEngine));
    }
    const engine = shared ?? engines.get(engineId)!;
    // What the connection looks like is each engine's own business: a
    // per-tab engine connects in its child process, so the parent's state
    // knows nothing about it (it would answer "not connected" forever).
    // The shared engine asks options.sessionInfo() through its adapter.
    const engineInfo = () => engine.info();
    if (req.method === 'GET' && path === '/api/session') {
      sendJson(res, 200, {
        engine: engineId,
        info: await engineInfo(),
        history: (await engine.history()).slice(0, 1000),
      });
      return;
    }
    if (req.method === 'GET' && path === '/api/events') {
      openEvents(req, res);
      return;
    }
    // The full history, newest first: Ctrl+R fetches this when it opens,
    // so search sees every entry the 10k cap allows. The session snapshot
    // stays at 1000 (it refreshes on every focus; shipping the whole list
    // each time would be the heavy path).
    if (req.method === 'GET' && path === '/api/history') {
      sendJson(res, 200, { history: await engine.history() });
      return;
    }
    if (req.method === 'GET' && path === '/api/profiles') {
      sendJson(res, 200, { profiles: savedProfileSummaries() });
      return;
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    // A cross-site page can make a browser send a POST; it cannot make it
    // send a same-origin Origin header, or application/json without a
    // preflight this server never grants.
    if (req.headers.origin === undefined) {
      throw new HttpError(403, 'Origin required');
    }
    const body = (await readJson(req)) as Record<string, unknown>;
    if (body === null || typeof body !== 'object') {
      throw new HttpError(400, 'Expected a JSON object');
    }

    if (path === '/api/connect') {
      const host = typeof body.host === 'string' ? body.host.trim() : '';
      if (!host) throw new HttpError(400, 'host must be a string');
      // Only a profile saved on this machine can be picked: no arbitrary
      // hosts from the page, no substring guessing.
      if (!savedProfileHosts().has(host)) {
        throw new HttpError(404, 'Not a saved connection profile');
      }
      if (shared && connecting) {
        // One shared engine: a second connect while one is in flight
        // would race the credentials.
        throw new HttpError(409, 'Already connecting');
      }
      connecting = true;
      try {
        const outcome = await engine.connect(host);
        sendJson(res, 200, outcome);
      } finally {
        connecting = false;
      }
      return;
    }
    if (path === '/api/eval') {
      if (shared && connecting) {
        throw new HttpError(409, 'Connecting; try again in a moment');
      }
      if (typeof body.code !== 'string' || body.code.trim() === '') {
        throw new HttpError(400, 'code must be a non-empty string');
      }
      const outcome = await engine.evaluate(body.code);
      if (outcome.status === 'incomplete') {
        sendJson(res, 200, { status: 'incomplete' });
      } else if (outcome.status === 'error') {
        sendJson(res, 200, {
          status: 'error',
          error: {
            name: outcome.name ?? 'Thrown',
            message: outcome.message ?? '',
          },
        });
      } else {
        sendJson(res, 200, { status: 'ok', result: outcome.result });
      }
      return;
    }
    if (path === '/api/children') {
      const { id, offset, limit } = body;
      if (!Number.isInteger(id)) throw new HttpError(400, 'id required');
      const page = await engine.children(
        id as number,
        Number.isInteger(offset) ? (offset as number) : 0,
        Number.isInteger(limit)
          ? Math.min(Math.max(limit as number, 1), 1000)
          : 200
      );
      if (!page) throw new HttpError(404, 'Unknown or released id');
      sendJson(res, 200, page);
      return;
    }
    if (path === '/api/json') {
      if (!Number.isInteger(body.id)) throw new HttpError(400, 'id required');
      const json = await engine.json(body.id as number);
      if (!json) throw new HttpError(404, 'Unknown or released id');
      sendJson(res, 200, json);
      return;
    }
    if (path === '/api/complete') {
      if (typeof body.line !== 'string' || body.line.length > 10_000) {
        throw new HttpError(400, 'line must be a string');
      }
      const [candidates, replace] = await engine.complete(body.line);
      sendJson(res, 200, { candidates, replace });
      return;
    }
    if (path === '/api/reset') {
      await engine.reset();
      sendJson(res, 200, { ok: true, info: await engineInfo() });
      return;
    }
    throw new HttpError(404, 'Not found');
  }

  async function route(
    req: http.IncomingMessage,
    res: http.ServerResponse
  ): Promise<void> {
    // Check 2: the Host header must name this server.
    const host = String(req.headers.host ?? '').toLowerCase();
    if (!allowedHosts().has(host)) {
      throw new HttpError(403, 'Forbidden: unexpected Host header');
    }
    // Check 3: an Origin header, if sent, must be this server's own.
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins().has(origin.toLowerCase())) {
      throw new HttpError(403, 'Forbidden: unexpected Origin');
    }
    const url = new URL(req.url ?? '/', `http://${host}`);

    if (url.pathname === '/' && req.method === 'GET') {
      const token = url.searchParams.get('t');
      if (hasSession(req)) {
        // Already signed in: drop any token from the address bar.
        if (token !== null) {
          res.writeHead(302, { ...baseHeaders, Location: '/' });
          res.end();
        } else {
          servePage(res);
        }
        return;
      }
      if (token === null) {
        throw new HttpError(
          401,
          'Not signed in. Open the link frodo printed in your terminal.'
        );
      }
      // Check 4: the link works once.
      if (launchUsed || !safeEqual(token, launchToken)) {
        throw new HttpError(
          403,
          'This link was already used or is not valid. Start the console again for a new one.'
        );
      }
      launchUsed = true;
      res.writeHead(302, {
        ...baseHeaders,
        Location: '/',
        // A session cookie would die with the browser, and the link is one-time:
        // the user could lock themselves out by closing the tab. A bounded
        // lifetime keeps the console reachable for a working day.
        'Set-Cookie': `${COOKIE}=${sessionSecret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`,
      });
      res.end();
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await api(req, res, url.pathname);
      return;
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204, baseHeaders);
      res.end();
      return;
    }
    throw new HttpError(404, 'Not found');
  }

  const server = http.createServer((req, res) => {
    if (active >= MAX_ACTIVE_REQUESTS) {
      sendJson(res, 503, { error: 'Too many requests' });
      return;
    }
    active++;
    res.on('close', () => {
      active--;
    });
    route(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof HttpError) {
        // Large uploads are not read; close the connection once answered.
        if (error.status === 413) {
          res.setHeader('Connection', 'close');
          res.once('finish', () => req.destroy());
        }
        sendJson(res, error.status, { error: error.message });
      } else {
        // Never describe an internal failure to the caller.
        sendJson(res, 500, { error: 'Internal error' });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, LOOPBACK, () => {
      server.off('error', reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;

  // An orphaned console must not live forever: a server whose controlling
  // terminal died without a signal (window closed, laptop lid, dropped
  // session) otherwise holds its port and its worker processes until the
  // machine reboots. Every minute, if no browser tab holds an event stream
  // and nothing was heard from a browser for a while, shut down. A tab
  // merely idling keeps its stream open, which counts as alive; only a
  // truly browser-less server (tab closed, laptop gone) expires.
  const IDLE_MS = 30 * 60 * 1000;
  const IDLE_CHECK_MS = 60 * 1000;
  let lastBrowserSeen = Date.now();
  const noteBrowserActivity = () => {
    lastBrowserSeen = Date.now();
  };
  const idleTimer = setInterval(() => {
    if (streams.size > 0) return;
    if (Date.now() - lastBrowserSeen < IDLE_MS) return;
    clearInterval(idleTimer);
    for (const engine of engines.values()) engine.dispose();
    server.closeAllConnections();
    void new Promise<void>((resolve) => server.close(() => resolve()));
  }, IDLE_CHECK_MS);
  idleTimer.unref();

  return {
    address: LOOPBACK,
    port,
    launchUrl: `http://${LOOPBACK}:${port}/?t=${launchToken}`,
    async close() {
      clearInterval(idleTimer);
      for (const engine of engines.values()) engine.dispose();
      for (const stream of streams) stream.end();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
