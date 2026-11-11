import cp from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import tls from 'tls';
import { fileURLToPath } from 'url';
import { ERROR_CODE_HINTS } from '../../src/utils/ErrorCodeHints.ts';
import { closedPort, startForwardProxy } from '../utils/ForwardProxy.js';
import { createShellTestHome, removeShellTestHome } from '../utils/ShellPty.js';
import { startFakeAm } from '../utils/StartFakeAm.js';

/**
 * Proxy support of the BUILT CLI (frodo-lib#982). The library tests its agents
 * from source; what only the CLI can show is that the bundle it ships still
 * has them: proxy-agent and the agents it loads on demand are inlined into the
 * bundle, and a bundling change can drop one without any source test noticing.
 *
 * `frodo realm list` runs against a fake tenant (loopback, no credentials of
 * any kind) with a forward proxy in this process between them, and the test
 * reads both ends: what the proxy was asked for and what the tenant received.
 * The fake tenant is plain http, so `HTTP_PROXY` covers it; the https path is
 * a TLS front with a self-signed certificate (made with the openssl command)
 * that hands the decrypted traffic to the same fake tenant, reached through
 * `HTTPS_PROXY` and `--insecure`. Every run gets an empty home, no token cache,
 * no update check and an environment without any proxy variable but the ones
 * the case sets.
 *
 * It runs `dist/launch.cjs` (`npx tsdown` first, the test scripts do not
 * rebuild it) and the native binary `dist-sea/frodo` too when that exists; the
 * binary is a different bundle (one file, no code splitting). Without it the
 * binary cases are reported as skipped.
 *
 * A proxy that fails is reported with the facts of frodo-lib (which proxy, what
 * it did) and the advice of the CLI (ErrorCodeHints), and a failure that is not
 * the proxy's (a tenant that is down, a target on NO_PROXY) gets neither
 * (frodo-lib#986).
 *
 * What it cannot show: a proxy in front of a real tenant (the live smoke test
 * of the pipeline does that, with squid), authentication schemes other than
 * Basic, and anything about a proxy that is not on loopback.
 */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const SEA = path.join(
  ROOT,
  'dist-sea',
  process.platform === 'win32' ? 'frodo.exe' : 'frodo'
);
const ARTIFACTS = [
  {
    name: 'dist/launch.cjs',
    available: true,
    command: process.execPath,
    prefix: [path.join(ROOT, 'dist/launch.cjs')],
  },
  {
    name: 'dist-sea/frodo',
    available: fs.existsSync(SEA),
    command: SEA,
    prefix: [],
  },
];

const REALMS = ['alpha', 'bravo'];
// what `frodo realm list` prints for them
const REALM_LIST = REALMS.map((realm) => `/${realm}`);
// the CLI answers a dead proxy within a second or two; this only has to tell it
// from a request that waits for a timeout (the CLI's is 30 seconds)
const QUICKLY_MS = 15000;

/** A self-signed certificate for 127.0.0.1, or undefined without the openssl command. */
function selfSignedCertificate(dir) {
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  const made = cp.spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
    ],
    { encoding: 'utf8' }
  );
  if (made.status !== 0) return undefined;
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

/** An https server on loopback that passes the decrypted bytes on to a plain http port. */
async function startTlsFront({ key, cert }, targetPort) {
  const sockets = new Set();
  const server = tls.createServer({ key, cert }, (socket) => {
    const upstream = net.connect(targetPort, '127.0.0.1');
    for (const s of [socket, upstream]) {
      sockets.add(s);
      s.on('close', () => sockets.delete(s));
      s.on('error', () => {
        socket.destroy();
        upstream.destroy();
      });
    }
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    stop: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

// Made once for the file. Without the openssl command there is none, and the
// https cases are reported as skipped; CI has it, and there they fail instead,
// so that they cannot disappear unnoticed.
const CERT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'proxy-support-'));
const CERTIFICATE = selfSignedCertificate(CERT_DIR);
const describeHttps = CERTIFICATE || process.env.CI ? describe : describe.skip;

afterAll(() => {
  fs.rmSync(CERT_DIR, { recursive: true, force: true });
});

const environment = (home, extra) => {
  // Nothing about proxies is inherited: not a developer's own settings and not
  // the squid variable of the live job. The case sets what it needs.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/proxy/i.test(name))
  );
  return {
    ...inherited,
    HOME: home,
    USERPROFILE: home,
    FRODO_CONNECTION_PROFILES_PATH: path.join(home, 'Connections.json'),
    FRODO_NO_CACHE: 'true',
    // the only call frodo makes on its own is the check for a newer release
    // (GitHub and npm); a hermetic test sends nothing there, and the proxy
    // must see only what the case is about
    FRODO_NO_UPDATE_CHECK: '1',
    FRODO_NO_PROMPT: '1',
    NO_COLOR: '1',
    FRODO_HOST: '',
    FRODO_REALM: '',
    FRODO_USERNAME: '',
    FRODO_PASSWORD: '',
    FRODO_SA_ID: '',
    FRODO_SA_JWK: '',
    FRODO_CREDENTIAL: '',
    ...extra,
  };
};

for (const artifact of ARTIFACTS) {
  (artifact.available ? describe : describe.skip)(
    `proxy support of ${artifact.name}`,
    () => {
      let scratch;
      let fakeAm;
      let recordPath;
      let front;
      let proxy;

      beforeAll(async () => {
        if (!fs.existsSync(artifact.prefix[0] ?? artifact.command)) {
          throw new Error(
            `${artifact.name} is missing: run npx tsdown (or npm run build:binary) before this test`
          );
        }
        scratch = createShellTestHome();
        recordPath = path.join(scratch, 'requests.jsonl');
        fakeAm = await startFakeAm({
          recordPath,
          journey: 'password',
          realms: REALMS,
        });
      });

      afterAll(async () => {
        fakeAm?.stop();
        removeShellTestHome(scratch);
      });

      beforeEach(() => {
        fs.writeFileSync(recordPath, '');
      });

      afterEach(async () => {
        await proxy?.stop();
        proxy = undefined;
      });

      /** What the fake tenant received, as `METHOD /path?query`, sorted. */
      const tenantReceived = () =>
        fs
          .readFileSync(recordPath, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line))
          .map(({ method, url }) => `${method} ${url}`)
          .sort();

      /**
       * Runs `frodo realm list` against the fake tenant from an empty home,
       * with no terminal and the given environment, and waits for it to end.
       */
      async function realmList({
        scheme = 'http',
        env = {},
        args = [],
        port = scheme === 'https' ? front.port : fakeAm.port,
      }) {
        const home = createShellTestHome();
        const started = Date.now();
        try {
          const child = cp.spawn(
            artifact.command,
            [
              ...artifact.prefix,
              'realm',
              'list',
              `${scheme}://127.0.0.1:${port}/am`,
              'alpha',
              'someone',
              'secret',
              ...args,
            ],
            {
              cwd: home,
              env: environment(home, env),
              stdio: ['ignore', 'pipe', 'pipe'],
            }
          );
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', (chunk) => (stdout += chunk));
          child.stderr.on('data', (chunk) => (stderr += chunk));
          const status = await new Promise((resolve, reject) => {
            child.once('error', reject);
            child.once('close', resolve);
          });
          return {
            status,
            stdout,
            stderr,
            output: stdout + stderr,
            ms: Date.now() - started,
          };
        } finally {
          removeShellTestHome(home);
        }
      }

      const listsTheRealms = (result) => {
        expect(result.output).toContain(REALM_LIST.join('\n'));
        expect(result.status).toBe(0);
      };

      describe('a plain http tenant, reached with HTTP_PROXY', () => {
        test('every request goes through the proxy and reaches the tenant', async () => {
          proxy = await startForwardProxy();
          const result = await realmList({
            env: { HTTP_PROXY: `http://127.0.0.1:${proxy.port}` },
          });
          listsTheRealms(result);
          const received = tenantReceived();
          expect(received.length).toBeGreaterThan(0);
          // the same requests, no more and no fewer, on both sides
          expect([...proxy.forwarded()].sort()).toEqual(received);
          expect(received).toContain(
            'GET /am/json/global-config/realms/?_queryFilter=true'
          );
          expect(proxy.tunnels()).toEqual([]);
          // addressed to the proxy as a proxy request, for the tenant's host:port
          expect(proxy.requests[0]).toMatchObject({
            kind: 'forward',
            target: `127.0.0.1:${fakeAm.port}`,
            absolute: true,
          });
        });

        test('the lower case http_proxy does the same', async () => {
          proxy = await startForwardProxy();
          const result = await realmList({
            env: { http_proxy: `http://127.0.0.1:${proxy.port}` },
          });
          listsTheRealms(result);
          expect([...proxy.forwarded()].sort()).toEqual(tenantReceived());
          expect(proxy.forwarded().length).toBeGreaterThan(0);
        });

        // With keep-alive (the default) the agent addresses the proxy in
        // absolute form, and sends the proxy's credentials, on the first
        // request of a connection only; a later request on the same connection
        // arrives in origin form (`GET /path`) without them. That is not
        // pinned here, so a fix will not fail this test. Without keep-alive
        // every request is a new connection and all of them must be proxy
        // requests.
        test('without keep-alive every request is addressed to the proxy as one', async () => {
          proxy = await startForwardProxy();
          const result = await realmList({
            env: {
              HTTP_PROXY: `http://127.0.0.1:${proxy.port}`,
              FRODO_NO_KEEPALIVE: '1',
            },
          });
          listsTheRealms(result);
          expect(proxy.requests.length).toBe(tenantReceived().length);
          expect(proxy.requests.filter((r) => !r.absolute)).toEqual([]);
        });

        test('without keep-alive every request carries the credentials of the proxy URL', async () => {
          proxy = await startForwardProxy({ credentials: 'agent:p@ss word' });
          const result = await realmList({
            env: {
              HTTP_PROXY: `http://agent:${encodeURIComponent('p@ss word')}@127.0.0.1:${proxy.port}`,
              FRODO_NO_KEEPALIVE: '1',
            },
          });
          listsTheRealms(result);
          expect(proxy.requests.length).toBe(tenantReceived().length);
          expect(new Set(proxy.requests.map((r) => r.authorization))).toEqual(
            new Set([
              `Basic ${Buffer.from('agent:p@ss word').toString('base64')}`,
            ])
          );
        });

        test('NO_PROXY with the tenant host keeps the proxy out of it', async () => {
          proxy = await startForwardProxy();
          const result = await realmList({
            env: {
              HTTP_PROXY: `http://127.0.0.1:${proxy.port}`,
              NO_PROXY: '127.0.0.1',
            },
          });
          listsTheRealms(result);
          expect(proxy.requests).toEqual([]);
          expect(tenantReceived()).toContain(
            'GET /am/json/global-config/realms/?_queryFilter=true'
          );
        });

        test('a proxy that is not listening fails the command quickly and nothing reaches the tenant', async () => {
          const dead = await closedPort();
          const result = await realmList({
            env: { HTTP_PROXY: `http://127.0.0.1:${dead}` },
          });
          expect(result.status).not.toBe(0);
          expect(result.output).toContain(`ECONNREFUSED 127.0.0.1:${dead}`);
          expect(result.stdout).not.toContain(REALM_LIST[0]);
          expect(result.ms).toBeLessThan(QUICKLY_MS);
          expect(tenantReceived()).toEqual([]);
          // and it says that the proxy refused the connection, not the tenant
          expect(result.output).toContain(
            `The proxy 127.0.0.1:${dead} refused the connection (ECONNREFUSED); the request was for an HTTP target.`
          );
          expect(result.output).toContain(
            ERROR_CODE_HINTS.PROXY_CONNECTION_REFUSED
          );
        });

        test('a proxy that wants credentials and gets none: the proxy is named, with advice, and the credentials are not shown', async () => {
          proxy = await startForwardProxy({ credentials: 'agent:secret' });
          const result = await realmList({
            env: {
              HTTP_PROXY: `http://agent:wrong-made-up@127.0.0.1:${proxy.port}`,
            },
          });
          expect(result.status).not.toBe(0);
          expect(result.output).toContain(
            `The proxy 127.0.0.1:${proxy.port} refused the request for an HTTP target with status 407 (Proxy Authentication Required). Proxy-Authenticate: Basic realm="test"`
          );
          expect(result.output).toContain(
            ERROR_CODE_HINTS.PROXY_AUTHENTICATION_REQUIRED
          );
          expect(result.output).not.toContain('wrong-made-up');
          expect(result.output).not.toContain('agent:');
          expect(tenantReceived()).toEqual([]);
        });

        test('a tenant that is down, with the proxy kept out by NO_PROXY, is not blamed on the proxy', async () => {
          const dead = await closedPort();
          const down = await closedPort();
          const result = await realmList({
            port: down,
            env: {
              HTTP_PROXY: `http://127.0.0.1:${dead}`,
              NO_PROXY: '127.0.0.1',
            },
          });
          expect(result.status).not.toBe(0);
          expect(result.output).toContain(`ECONNREFUSED 127.0.0.1:${down}`);
          expect(result.output).not.toMatch(/proxy/i);
        });

        test('a tenant that is down, with no proxy at all, is not blamed on a proxy', async () => {
          const down = await closedPort();
          const result = await realmList({ port: down });
          expect(result.status).not.toBe(0);
          expect(result.output).toContain(`ECONNREFUSED 127.0.0.1:${down}`);
          expect(result.output).not.toMatch(/proxy/i);
        });
      });

      describeHttps(
        'an https tenant with a self-signed certificate, reached with HTTPS_PROXY',
        () => {
          beforeAll(async () => {
            if (!CERTIFICATE) {
              throw new Error(
                'the openssl command is needed for the https cases'
              );
            }
            front = await startTlsFront(CERTIFICATE, fakeAm.port);
          });

          afterAll(async () => {
            await front?.stop();
          });

          const received = tenantReceived;

          test('the proxy opens a tunnel to the tenant and the traffic goes through it', async () => {
            proxy = await startForwardProxy();
            const result = await realmList({
              scheme: 'https',
              args: ['--insecure'],
              env: { HTTPS_PROXY: `http://127.0.0.1:${proxy.port}` },
            });
            listsTheRealms(result);
            // inside a tunnel the proxy sees nothing but the CONNECT
            expect(proxy.forwarded()).toEqual([]);
            expect(proxy.tunnels().length).toBeGreaterThan(0);
            expect(new Set(proxy.tunnels())).toEqual(
              new Set([`127.0.0.1:${front.port}`])
            );
            expect(proxy.requests[0].authorization).toBeUndefined();
            expect(received()).toContain(
              'GET /am/json/global-config/realms/?_queryFilter=true'
            );
          });

          test('credentials in the proxy URL are sent to the proxy as Basic authorization', async () => {
            proxy = await startForwardProxy({ credentials: 'agent:p@ss word' });
            const result = await realmList({
              scheme: 'https',
              args: ['--insecure'],
              env: {
                HTTPS_PROXY: `http://agent:${encodeURIComponent('p@ss word')}@127.0.0.1:${proxy.port}`,
              },
            });
            listsTheRealms(result);
            expect(proxy.tunnels().length).toBeGreaterThan(0);
            expect(new Set(proxy.requests.map((r) => r.authorization))).toEqual(
              new Set([
                `Basic ${Buffer.from('agent:p@ss word').toString('base64')}`,
              ])
            );
            expect(received()).toContain(
              'GET /am/json/global-config/realms/?_queryFilter=true'
            );
          });

          test('a proxy that wants credentials and gets none fails the command and nothing reaches the tenant', async () => {
            proxy = await startForwardProxy({ credentials: 'agent:secret' });
            const result = await realmList({
              scheme: 'https',
              args: ['--insecure'],
              env: { HTTPS_PROXY: `http://127.0.0.1:${proxy.port}` },
            });
            expect(result.status).not.toBe(0);
            expect(result.output).toContain('Status: 407');
            expect(proxy.tunnels().length).toBeGreaterThan(0);
            expect(received()).toEqual([]);
            // the proxy is named and what it did, then the advice
            expect(result.output).toContain(
              `The proxy 127.0.0.1:${proxy.port} refused the CONNECT request for an HTTPS target with status 407 (Proxy Authentication Required). Proxy-Authenticate: Basic realm="test"`
            );
            expect(result.output).toContain(
              ERROR_CODE_HINTS.PROXY_AUTHENTICATION_REQUIRED
            );
          });

          test('credentials that the proxy does not accept are not shown in the error or in the advice', async () => {
            proxy = await startForwardProxy({ credentials: 'agent:secret' });
            const result = await realmList({
              scheme: 'https',
              args: ['--insecure'],
              env: {
                HTTPS_PROXY: `http://agent:wrong-made-up@127.0.0.1:${proxy.port}/path?token=made-up-token`,
              },
            });
            expect(result.status).not.toBe(0);
            expect(result.output).toContain(
              ERROR_CODE_HINTS.PROXY_AUTHENTICATION_REQUIRED
            );
            for (const secret of [
              'wrong-made-up',
              'made-up-token',
              'agent:',
              Buffer.from('agent:wrong-made-up').toString('base64'),
            ]) {
              expect(result.output).not.toContain(secret);
            }
            expect(received()).toEqual([]);
          });

          test('a proxy that cannot connect to the tenant refuses the tunnel, and the advice is about the proxy and the tenant host', async () => {
            proxy = await startForwardProxy();
            const down = await closedPort();
            const result = await realmList({
              scheme: 'https',
              port: down,
              args: ['--insecure'],
              env: { HTTPS_PROXY: `http://127.0.0.1:${proxy.port}` },
            });
            expect(result.status).not.toBe(0);
            expect(result.output).toContain(
              `The proxy 127.0.0.1:${proxy.port} refused the CONNECT request for an HTTPS target with status 502 (Bad Gateway).`
            );
            expect(result.output).toContain(
              ERROR_CODE_HINTS.PROXY_TUNNEL_REFUSED
            );
            expect(proxy.tunnels()).toContain(`127.0.0.1:${down}`);
          });

          test('a tenant that is down, with the proxy kept out by NO_PROXY, is not blamed on the proxy', async () => {
            const dead = await closedPort();
            const down = await closedPort();
            const result = await realmList({
              scheme: 'https',
              port: down,
              args: ['--insecure'],
              env: {
                HTTPS_PROXY: `http://127.0.0.1:${dead}`,
                NO_PROXY: '127.0.0.1',
              },
            });
            expect(result.status).not.toBe(0);
            expect(result.output).toContain(`ECONNREFUSED 127.0.0.1:${down}`);
            expect(result.output).not.toMatch(/proxy/i);
          });

          test('NO_PROXY with the tenant host keeps the proxy out of it', async () => {
            proxy = await startForwardProxy();
            const result = await realmList({
              scheme: 'https',
              args: ['--insecure'],
              env: {
                HTTPS_PROXY: `http://127.0.0.1:${proxy.port}`,
                NO_PROXY: '127.0.0.1',
              },
            });
            listsTheRealms(result);
            expect(proxy.requests).toEqual([]);
            expect(received()).toContain(
              'GET /am/json/global-config/realms/?_queryFilter=true'
            );
          });

          test('a proxy that is not listening fails the command quickly and nothing reaches the tenant', async () => {
            const dead = await closedPort();
            const result = await realmList({
              scheme: 'https',
              args: ['--insecure'],
              env: { HTTPS_PROXY: `http://127.0.0.1:${dead}` },
            });
            expect(result.status).not.toBe(0);
            expect(result.output).toContain(`ECONNREFUSED 127.0.0.1:${dead}`);
            expect(result.ms).toBeLessThan(QUICKLY_MS);
            expect(received()).toEqual([]);
            // and it says that the proxy refused the connection, not the tenant
            expect(result.output).toContain(
              `The proxy 127.0.0.1:${dead} refused the connection (ECONNREFUSED); the request was for an HTTPS target.`
            );
            expect(result.output).toContain(
              ERROR_CODE_HINTS.PROXY_CONNECTION_REFUSED
            );
          });
        }
      );
    }
  );
}
