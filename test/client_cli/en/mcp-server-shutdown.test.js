/**
 * 'mcp server start' ends the sessions it created when it shuts down
 * (frodo-cli#1057, frodo-lib#908, core 0021). The tests start real server
 * processes against the fake AM (test/utils/FakeAm.mjs), stop them the ways a
 * client or a supervisor does (stdin closed, a signal) and count the logout
 * requests in the fake's request log.
 *
 * The library decides which sessions a process may end: with the token cache
 * on (the default) the session went into the cache and may be in use by
 * another server, so nothing is logged out; with `--no-cache` the process
 * ends what it created.
 *
 * Every process runs with its own HOME and config directory: nothing of these
 * tests touches the real ~/.frodo.
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { startFakeAm } from '../../utils/StartFakeAm.js';

const execFile = promisify(cp.execFile);
const cliPath = path.resolve('dist/launch.cjs');

let testDirectory;
let fakeAm;
let recordPath;
let children;
let clients;

function requests() {
  if (!fs.existsSync(recordPath)) return [];
  return fs
    .readFileSync(recordPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/** A login starts with an empty `authenticate` request. */
function loginCount() {
  return requests().filter(
    (request) =>
      request.method === 'POST' &&
      request.url.endsWith('/authenticate') &&
      request.body === '{}'
  ).length;
}

function logoutCount() {
  return requests().filter(
    (request) =>
      request.method === 'POST' && request.url.includes('_action=logout')
  ).length;
}

async function waitFor(condition, what, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The environment of a server process: its own HOME, cache and config. */
function serverEnvironment() {
  const env = {
    ...process.env,
    FRODO_TEST: '0',
    NO_COLOR: '1',
    HOME: testDirectory,
    USERPROFILE: testDirectory,
    FRODO_CONFIG_PATH: testDirectory,
    FRODO_TOKEN_CACHE_PATH: path.join(testDirectory, 'TokenCache.json'),
    FRODO_MASTER_KEY_PATH: path.join(testDirectory, 'masterkey.key'),
    FRODO_CONNECTION_PROFILES_PATH: path.join(
      testDirectory,
      'Connections.json'
    ),
  };
  // The jest setup switches the cache off for every test (FRODO_NO_CACHE);
  // these servers decide it with --no-cache or by leaving it on.
  delete env.FRODO_NO_CACHE;
  return env;
}

function serverArguments({ transport, cache, extra = [] }) {
  return [
    cliPath,
    'mcp',
    'server',
    'start',
    `http://127.0.0.1:${fakeAm.port}/am`,
    'admin',
    'Passw0rd!',
    '--type',
    'classic',
    '--policy',
    'read-only',
    '--profile',
    'authentication',
    '--transport',
    transport,
    ...(transport === 'http' ? ['--port', 'auto'] : []),
    ...(cache ? [] : ['--no-cache']),
    ...extra,
  ];
}

/**
 * Starts a server process that the test stops itself (a signal, or stdin
 * closed), and resolves once it serves: the HTTP listener is up, or the stdio
 * server has logged its startup.
 */
async function startServer({ transport, cache }) {
  const child = cp.spawn(
    process.execPath,
    serverArguments({ transport, cache }),
    {
      env: serverEnvironment(),
      cwd: testDirectory,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  );
  children.push(child);
  const server = {
    child,
    output: '',
    port: undefined,
    exit: new Promise((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal }))
    ),
  };
  const collect = (chunk) => {
    server.output += chunk.toString();
  };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  if (transport === 'http') {
    await waitFor(
      () => /listening on http:\/\/127\.0\.0\.1:\d+\/mcp/.test(server.output),
      'the HTTP listener'
    );
    server.port = Number(
      server.output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)\/mcp/)[1]
    );
  } else {
    await waitFor(
      () => server.output.includes('Connected to'),
      'the stdio server to start'
    );
    // The signal handlers are registered in the same tick as that line.
    await sleep(100);
  }
  return server;
}

function lockfileExists(server) {
  return fs.existsSync(path.join(testDirectory, `mcp-http-${server.port}.pid`));
}

function healthAnswers(server) {
  return fetch(`http://127.0.0.1:${server.port}/health`).then(
    (response) => response.ok,
    () => false
  );
}

beforeEach(async () => {
  testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-mcp-shutdown-'));
  recordPath = path.join(testDirectory, 'requests.jsonl');
  // The session expires in an hour, like a real one: the server schedules its
  // token refresh from the expiry.
  fakeAm = await startFakeAm({
    recordPath,
    journey: 'password',
    sessionTtlSeconds: 3600,
  });
  children = [];
  clients = [];
});

afterEach(async () => {
  await Promise.all(clients.map((client) => client.close().catch(() => {})));
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }
  fakeAm.stop();
  fs.rmSync(testDirectory, { recursive: true, force: true });
});

describe('HTTP transport', () => {
  test.each(['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT'])(
    'with --no-cache, %s logs out the session of the server, and the shutdown is clean',
    async (signal) => {
      const server = await startServer({ transport: 'http', cache: false });
      expect(loginCount()).toBe(1);
      expect(logoutCount()).toBe(0);
      expect(lockfileExists(server)).toBe(true);

      server.child.kill(signal);
      const { code } = await server.exit;

      expect(code).toBe(0);
      expect(logoutCount()).toBe(1);
      expect(lockfileExists(server)).toBe(false);
      expect(await healthAnswers(server)).toBe(false);
    },
    60000
  );

  test('with the token cache on, a shutdown makes no logout request: the session is in the cache and may be in use by another server', async () => {
    const server = await startServer({ transport: 'http', cache: true });
    expect(loginCount()).toBe(1);

    server.child.kill('SIGTERM');
    const { code } = await server.exit;

    expect(code).toBe(0);
    expect(logoutCount()).toBe(0);
    expect(lockfileExists(server)).toBe(false);
  }, 60000);

  test('a refused logout is a warning: the exit code stays 0 and the server still releases its lockfile and port', async () => {
    fakeAm.stop();
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      sessionTtlSeconds: 3600,
      logout: 'refuse',
    });
    const server = await startServer({ transport: 'http', cache: false });

    server.child.kill('SIGTERM');
    const { code } = await server.exit;

    expect(code).toBe(0);
    expect(logoutCount()).toBe(1);
    expect(server.output).toContain(
      'warning: shutdown: Could not end the server session'
    );
    expect(lockfileExists(server)).toBe(false);
    expect(await healthAnswers(server)).toBe(false);
  }, 60000);

  test('a logout that AM never answers does not hold up the port or the lockfile, and the shutdown goes on after three seconds', async () => {
    fakeAm.stop();
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      sessionTtlSeconds: 3600,
      logout: 'hang',
    });
    const server = await startServer({ transport: 'http', cache: false });

    const signalled = Date.now();
    server.child.kill('SIGTERM');
    await waitFor(() => logoutCount() === 1, 'the logout request');
    await sleep(300);

    // The logout is still pending, and the server is already gone.
    expect(server.output).not.toContain('Ending the sessions took more than');
    expect(lockfileExists(server)).toBe(false);
    expect(await healthAnswers(server)).toBe(false);

    await waitFor(
      () =>
        server.output.includes('Ending the sessions took more than 3000 ms'),
      'the time limit of the shutdown',
      10000
    );
    expect(Date.now() - signalled).toBeGreaterThanOrEqual(2900);
    expect(Date.now() - signalled).toBeLessThan(8000);
  }, 60000);
});

describe('stdio transport', () => {
  test('with --no-cache, stdin reaching end-of-file logs out the session, and the process ends by itself', async () => {
    const server = await startServer({ transport: 'stdio', cache: false });
    expect(loginCount()).toBe(1);
    expect(logoutCount()).toBe(0);

    server.child.stdin.end();
    const { code, signal } = await server.exit;

    expect(signal).toBeNull();
    expect(code).toBe(0);
    expect(logoutCount()).toBe(1);
  }, 60000);

  test.each(['SIGTERM', 'SIGINT'])(
    'with --no-cache, %s logs out the session and still ends the process',
    async (signal) => {
      const server = await startServer({ transport: 'stdio', cache: false });
      expect(logoutCount()).toBe(0);

      server.child.kill(signal);
      await server.exit;

      expect(logoutCount()).toBe(1);
    },
    60000
  );

  test('with the token cache on, closing stdin makes no logout request', async () => {
    const server = await startServer({ transport: 'stdio', cache: true });
    expect(loginCount()).toBe(1);

    server.child.stdin.end();
    const { code } = await server.exit;

    expect(code).toBe(0);
    expect(logoutCount()).toBe(0);
  }, 60000);

  test('a refused logout does not change the exit code of a closed stdin', async () => {
    fakeAm.stop();
    fakeAm = await startFakeAm({
      recordPath,
      journey: 'password',
      sessionTtlSeconds: 3600,
      logout: 'refuse',
    });
    const server = await startServer({ transport: 'stdio', cache: false });

    server.child.stdin.end();
    const { code } = await server.exit;

    expect(code).toBe(0);
    expect(logoutCount()).toBe(1);
    expect(server.output).toContain('Could not end the server session');
  }, 60000);
});

describe('request-scoped instances', () => {
  async function connect(cache) {
    const client = new Client(
      { name: 'frodo-cli-test', version: '1.0.0' },
      { supportedProtocolVersions: ['2025-11-25'] }
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: serverArguments({ transport: 'stdio', cache }),
      env: serverEnvironment(),
      cwd: testDirectory,
      stderr: 'pipe',
    });
    await client.connect(transport);
    clients.push(client);
    return client;
  }

  async function readJourneysInRealm(client, realm) {
    return client.callTool({
      name: 'frodo_dispatch_read_only',
      arguments: { skillId: 'authn.journey.readJourneys', realm },
    });
  }

  test('with --no-cache, the session of a realm-overridden request is logged out when the request is over, the one of the server at shutdown', async () => {
    const client = await connect(false);
    expect(loginCount()).toBe(1);

    await readJourneysInRealm(client, 'alpha');

    // The request got an instance of its own, with a login of its own, and
    // its session ended with the request: the server still runs.
    expect(loginCount()).toBe(2);
    await waitFor(() => logoutCount() === 1, 'the logout of the request');
    await sleep(300);
    expect(logoutCount()).toBe(1);

    await client.close();
    clients.pop();
    await waitFor(() => logoutCount() === 2, 'the logout of the server');
  }, 60000);

  test('with the token cache on, a realm-overridden request makes no login and no logout: it uses the session in the cache', async () => {
    const client = await connect(true);
    expect(loginCount()).toBe(1);

    await readJourneysInRealm(client, 'alpha');
    await readJourneysInRealm(client, 'bravo');
    await sleep(300);

    expect(loginCount()).toBe(1);
    expect(logoutCount()).toBe(0);

    await client.close();
    clients.pop();
    await sleep(500);
    expect(logoutCount()).toBe(0);
  }, 60000);
});

describe('--dry-run', () => {
  test('with --no-cache, the login of a dry run is logged out before the command ends', async () => {
    const { stdout, stderr } = await execFile(
      process.execPath,
      serverArguments({
        transport: 'stdio',
        cache: false,
        extra: ['--dry-run'],
      }),
      { env: serverEnvironment(), cwd: testDirectory }
    );

    expect(stdout + stderr).toContain('Dry run completed successfully.');
    expect(loginCount()).toBe(1);
    expect(logoutCount()).toBe(1);
  }, 60000);

  test('with the token cache on, a dry run logs nothing out', async () => {
    await execFile(
      process.execPath,
      serverArguments({
        transport: 'stdio',
        cache: true,
        extra: ['--dry-run'],
      }),
      { env: serverEnvironment(), cwd: testDirectory }
    );

    expect(loginCount()).toBe(1);
    expect(logoutCount()).toBe(0);
  }, 60000);
});
