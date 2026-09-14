/**
 * Unit tests for the MCP HTTP transport layer (McpServerOps.ts): signal
 * handling, EADDRINUSE ergonomics, Host allow-list computation, the bearer
 * auth helper, and the era-conditional request-metadata gate.
 *
 * Mocking mirrors ThemeConfig.test.js: the real import graph pulls in all of
 * frodo-lib (whose bundled ESM cannot load under jest's ESM runtime), so a
 * minimal frodo-lib surface plus Console/Version are mocked BEFORE the
 * dynamic import of the module under test. The MCP SDK packages are NOT
 * mocked — the SDK is exactly what the transport wraps, so exercising the
 * real one keeps the era gate honest against real SDK semantics.
 */
import http from 'node:http';
import net from 'node:net';
import childProcess from 'node:child_process';
import fsPromise from 'node:fs';
import osPromise from 'node:os';
import pathPromise from 'node:path';
import { jest } from '@jest/globals';

// ESM tests have no `require`; alias the pieces the tests need.
const { request: httpRequest } = http;
// The launcher test below needs fs/os/path; `path` is also used by the
// resolveMcpAuthTokenValue import at line ~330 in its own scope.

// Overridable per-test; buildAmTokenInfoVerifier's tests reassign this.
let mockGetTokenInfo = async () => {
  throw new Error('getTokenInfo mock not configured');
};
// Overridable per-test; buildRequestContext's bearer-token tests reassign
// these. Every other existing test in this file relies on the undefined
// default (no host configured).
let mockStateHost;
let mockStateDeploymentType;
// Overridable per-test; external-IDP verifier/resolver tests reassign these.
let mockVerifyJwtAgainstJwks = async () => {
  throw new Error('verifyJwtAgainstJwks mock not configured');
};
let mockGetAdditionalServiceAccount = async () => {
  throw new Error('getAdditionalServiceAccount mock not configured');
};

jest.unstable_mockModule('@rockcarver/frodo-lib', () => ({
  getRealmFromContext: () => undefined,
  resolveRequestScopedFrodo: async (_context, frodoSingleton) => frodoSingleton,
  // Pulled in transitively via ./AuthenticateOps.js's getUseDeviceFlow
  // import (frodo-cli's own AuthenticateOps.ts destructures frodo.login/
  // frodo.utils.constants at module top level) — only needs to exist, this
  // test never exercises browser-login auth mode.
  frodo: {
    login: {
      getTokens: async () => ({}),
      getTokensInteractive: async () => ({}),
    },
    oauth2oidc: {
      endpoint: {
        getTokenInfo: (...args) => mockGetTokenInfo(...args),
      },
    },
    conn: {
      getAdditionalServiceAccount: (...args) =>
        mockGetAdditionalServiceAccount(...args),
    },
    utils: {
      constants: { DEPLOYMENT_TYPES: [] },
      jose: {
        verifyJwtAgainstJwks: (...args) => mockVerifyJwtAgainstJwks(...args),
      },
    },
  },
  state: {
    // Overridable by buildRequestContext's bearer-token tests; every other
    // existing test in this file relies on the undefined default.
    getHost: () => mockStateHost,
    getRealm: () => undefined,
    getServiceAccountId: () => undefined,
    getServiceAccountJwk: () => undefined,
    getUsername: () => undefined,
    getPassword: () => undefined,
    getDeploymentType: () => mockStateDeploymentType,
    getAllowInsecureConnection: () => false,
    getDebug: () => false,
    getCurlirize: () => false,
    getState: () => ({}),
    getAuthMode: () => 'noninteractive',
    getBrowserLoginClientId: () => undefined,
    getBrowserLoginScope: () => undefined,
    getBrowserLoginRedirectPort: () => undefined,
  },
}));

const printed = [];
jest.unstable_mockModule('../../src/utils/Console', () => ({
  printMessage: (msg, type) => {
    printed.push({ msg: String(msg), type });
  },
  // Pulled in transitively via ./AuthenticateOps.js's getUseDeviceFlow
  // import — only need to exist, this test never exercises them.
  printError: () => {},
  verboseMessage: () => {},
}));

jest.unstable_mockModule('../../src/utils/Version', () => ({
  getCliBuildTimestamp: () => 'test-build',
}));

const {
  buildAmOAuthMetadata,
  buildAmTokenInfoVerifier,
  buildClaimMappedCredentialResolver,
  buildExternalIdpVerifier,
  buildRequestContext,
  computeHttpAllowedHosts,
  isLoopbackBindHost,
  registerServerCrashHandlers,
  startHttpTransport,
  validateHttpRequestMetadata,
  verifyMcpBearerAuthorization,
  verifyMcpOAuthBearerToken,
} = await import('../../src/ops/McpServerOps.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Binds an ephemeral port, reads it back, and releases it. */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

/**
 * Starts the transport and resolves once the listener accepts connections.
 *
 * Returns the transport's shutdown promise itself (NOT an async wrapper):
 * awaiting an `async` helper here would adopt the shutdown promise and block
 * the test until the server stops, instead of handing it back for the
 * afterEach cleanup to resolve.
 */
function startServer(bindHost, port, options) {
  return startHttpTransport(
    { listTools: () => [] },
    bindHost,
    port,
    undefined,
    options
  );
}

/** Polls until the port accepts connections (or the deadline passes). */
function waitForListening(bindHost, port, deadlineMs = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tryConnect = () => {
      const socket = net.connect(port, bindHost);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > started + deadlineMs) {
          reject(
            new Error(
              `server on ${bindHost}:${port} never accepted a connection`
            )
          );
        } else {
          setTimeout(tryConnect, 25);
        }
      });
    };
    tryConnect();
  });
}

/** A raw node:http request, bypassing fetch's normalizations. */
function rawRequest(port, method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, method, path, headers: headers ?? {} },
      (res) => {
        const chunks = [];
        // SSE responses never end; resolve on first data so tests can read
        // the priming event and move on. Regular responses resolve on 'end'.
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          req.destroy();
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        };
        res.on('data', (chunk) => {
          chunks.push(chunk);
          if (
            String(res.headers['content-type']).includes('text/event-stream')
          ) {
            settle();
          }
        });
        res.once('end', settle);
      }
    );
    // Reject on real request errors, but tolerate the ECONNRESET/socket hang
    // up that destroying the socket after a settled response produces.
    req.on('error', (err) => {
      if (settled) return;
      if (!String(err).includes('socket hang up')) {
        reject(err);
      }
    });
    if (body !== undefined) {
      req.end(body);
    } else {
      req.end();
    }
  });
}

/** A JSON-RPC POST body shaped like a 2025-era initialize handshake. */
function legacyInitializeBody(version = '2025-06-18') {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: version, capabilities: {}, clientInfo: { name: 't', version: '1' } },
  });
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  // Streamable HTTP requires both accept types on POST /mcp.
  accept: 'application/json, text/event-stream',
};

// The 2026-07-28 envelope keys (SDK parity) and the modern revision, used by
// both the metadata-gate suite and the HTTP integration cells.
const META = 'io.modelcontextprotocol/protocolVersion';
const CAPS = 'io.modelcontextprotocol/clientCapabilities';
const PV = '2026-07-28';

// ---------------------------------------------------------------------------
// Host allow-list computation
// ---------------------------------------------------------------------------

describe('computeHttpAllowedHosts', () => {
  test('defaults to the localhost set on a loopback bind', () => {
    expect(computeHttpAllowedHosts('127.0.0.1')).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
    ]);
    expect(computeHttpAllowedHosts('localhost')).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
    ]);
    expect(computeHttpAllowedHosts('::1')).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
    ]);
  });

  test('extends the localhost set with the provided hosts', () => {
    expect(computeHttpAllowedHosts('127.0.0.1', ['gateway.internal'])).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
      'gateway.internal',
    ]);
  });

  test('auto-includes host.docker.internal on a non-loopback bind', () => {
    const hosts = computeHttpAllowedHosts('0.0.0.0', ['gateway.internal']);
    expect(hosts).toContain('host.docker.internal');
    expect(hosts).toContain('gateway.internal');
    expect(hosts).toContain('localhost');
  });

  test('does not duplicate host.docker.internal when provided explicitly', () => {
    const hosts = computeHttpAllowedHosts('0.0.0.0', ['host.docker.internal']);
    expect(hosts.filter((h) => h === 'host.docker.internal')).toHaveLength(1);
  });

  test('ignores empty entries', () => {
    expect(computeHttpAllowedHosts('127.0.0.1', ['', 'x'])).toEqual([
      'localhost',
      '127.0.0.1',
      '[::1]',
      'x',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Loopback bind-host classification
// ---------------------------------------------------------------------------

describe('isLoopbackBindHost', () => {
  test('classifies loopback addresses and names', () => {
    expect(isLoopbackBindHost('127.0.0.1')).toBe(true);
    expect(isLoopbackBindHost('127.9.9.9')).toBe(true);
    expect(isLoopbackBindHost('localhost')).toBe(true);
    expect(isLoopbackBindHost('LOCALHOST')).toBe(true);
    expect(isLoopbackBindHost('::1')).toBe(true);
    expect(isLoopbackBindHost('[::1]')).toBe(true);
  });

  test('classifies non-loopback binds as exposed', () => {
    expect(isLoopbackBindHost('0.0.0.0')).toBe(false);
    expect(isLoopbackBindHost('192.168.1.10')).toBe(false);
    expect(isLoopbackBindHost('host.example.com')).toBe(false);
    expect(isLoopbackBindHost('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bearer-token verification
// ---------------------------------------------------------------------------

describe('verifyMcpBearerAuthorization', () => {
  test('accepts the exact token in a Bearer header', () => {
    expect(verifyMcpBearerAuthorization('Bearer testsecret', 'testsecret')).toBe(true);
  });

  test('is case-insensitive on the scheme and tolerates extra whitespace', () => {
    expect(verifyMcpBearerAuthorization('bearer  testsecret', 'testsecret')).toBe(true);
    expect(verifyMcpBearerAuthorization(' BEARER\ttestsecret ', 'testsecret')).toBe(true);
  });

  test('rejects a wrong token', () => {
    expect(verifyMcpBearerAuthorization('Bearer wrong', 'testsecret')).toBe(false);
  });

  test('rejects missing/malformed headers without throwing', () => {
    expect(verifyMcpBearerAuthorization(undefined, 'testsecret')).toBe(false);
    expect(verifyMcpBearerAuthorization('', 'testsecret')).toBe(false);
    expect(verifyMcpBearerAuthorization('Bearer', 'testsecret')).toBe(false);
    expect(verifyMcpBearerAuthorization('Bearer ', 'testsecret')).toBe(false);
    expect(verifyMcpBearerAuthorization('Basic dXNlcjpwYXNz', 'testsecret')).toBe(false);
  });

  test('rejects when no token is configured', () => {
    expect(verifyMcpBearerAuthorization('Bearer testsecret', '')).toBe(false);
    expect(verifyMcpBearerAuthorization('Bearer testsecret', undefined)).toBe(false);
  });

  test('does not leak the token via prefix matching', () => {
    // A prefix of the real token must not authenticate.
    expect(verifyMcpBearerAuthorization('Bearer testsecre', 'testsecret')).toBe(false);
    // A longer string sharing the prefix must not authenticate either.
    expect(verifyMcpBearerAuthorization('Bearer testsecret-extra', 'testsecret')).toBe(false);
  });

  test('rejects the duplicate-header folding shape (first value wins in node:http)', () => {
    // node:http folds repeated Authorization headers into a single
    // comma-joined header value — except `authorization`, which is on
    // node's single-value header list, so the SERVER sees only the FIRST
    // value (verified against a live node:http server). The joined form
    // below is therefore only reachable at this helper's own boundary (a
    // reverse proxy that joins duplicates before forwarding); asserting it
    // documents the failure mode: whatever reaches the timing-safe compare
    // must match the token exactly, and a folded string never does.
    expect(
      verifyMcpBearerAuthorization('Bearer testsecret, Bearer other', 'testsecret')
    ).toBe(false);
    expect(
      verifyMcpBearerAuthorization('Bearer testsecret, Bearer testsecret', 'testsecret')
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Bearer-token resolution (CLI flag / env fallback)
// ---------------------------------------------------------------------------

describe('resolveMcpAuthTokenValue', () => {
  const ENV_NAME = 'FRODO_MCP_AUTH_TOKEN';
  let savedEnv;
  let resolveMcpAuthTokenValue;

  beforeAll(async () => {
    // server-auth.ts is dependency-free, so this import needs no mocks.
    ({ resolveMcpAuthTokenValue } = await import(
      '../../src/cli/mcp/server/server-auth.ts'
    ));
  });

  beforeEach(() => {
    savedEnv = process.env[ENV_NAME];
    delete process.env[ENV_NAME];
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env[ENV_NAME];
    } else {
      process.env[ENV_NAME] = savedEnv;
    }
  });

  test('prefers the flag over the environment variable', () => {
    process.env[ENV_NAME] = 'env-token';
    expect(resolveMcpAuthTokenValue('flag-token', process.env[ENV_NAME])).toBe('flag-token');
  });

  test('falls back to the environment variable', () => {
    process.env[ENV_NAME] = 'env-token';
    expect(resolveMcpAuthTokenValue(undefined, process.env[ENV_NAME])).toBe('env-token');
  });

  test('treats an empty string as unset (flag and env)', () => {
    // An empty bearer token would be enforceable yet trivially guessable;
    // resolution must yield undefined so the startup refusal for non-loopback
    // binds and the "no token configured" path both see it as absent rather
    // than enforcing a zero-length secret.
    expect(resolveMcpAuthTokenValue('', undefined)).toBeUndefined();
    expect(resolveMcpAuthTokenValue(undefined, '')).toBeUndefined();
    // An empty flag does not shadow a set env var (falsy, so env is read).
    expect(resolveMcpAuthTokenValue('', 'env-token')).toBe('env-token');
  });
});

// ---------------------------------------------------------------------------
// Era-conditional request-metadata gate
// ---------------------------------------------------------------------------

describe('validateHttpRequestMetadata', () => {
  const META_KEY = META;
  const CAPS_KEY = CAPS;

  function fakeReq(headers = {}) {
    return { headers };
  }

  function legacyInitialize(version = '2025-06-18') {
    return {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: version, capabilities: {}, clientInfo: {} },
    };
  }

  function legacyToolsList() {
    return { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };
  }

  function modernRequest() {
    return {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'frodo_discover',
        arguments: {},
        _meta: {
          [META_KEY]: '2026-07-28',
          [CAPS_KEY]: {},
        },
      },
    };
  }

  test('passes a 2025-era initialize with no modern headers (the gateway incident)', () => {
    expect(validateHttpRequestMetadata(fakeReq(), legacyInitialize())).toBeNull();
  });

  test('passes a 2025-era tools/list with no modern headers', () => {
    expect(validateHttpRequestMetadata(fakeReq(), legacyToolsList())).toBeNull();
  });

  test('passes a legacy request carrying a pre-2026 MCP-Protocol-Version header', () => {
    expect(
      validateHttpRequestMetadata(
        fakeReq({ 'mcp-protocol-version': '2025-06-18' }),
        legacyToolsList()
      )
    ).toBeNull();
  });

  test('ignores stray Mcp-Method/Mcp-Name headers on legacy requests', () => {
    expect(
      validateHttpRequestMetadata(
        fakeReq({ 'mcp-method': 'tools/list', 'mcp-name': 'whatever' }),
        legacyToolsList()
      )
    ).toBeNull();
  });

  test('rejects a modern header naming a different version than the initialize handshake', () => {
    // initialize + modern header is a cross-check mismatch (SDK parity),
    // regardless of the initialize version.
    const err = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
      legacyInitialize('2025-06-18')
    );
    expect(err.error.code).toBe(-32020);
    expect(err.statusCode).toBe(400);
  });

  test('rejects a modern header on a claim-less request with -32602', () => {
    const err = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
      legacyToolsList()
    );
    expect(err.error.code).toBe(-32602);
    expect(err.error.message).toContain('missing the required per-request envelope key');
    expect(err.error.data).toEqual({ envelope: { missing: ['_meta'] } });
  });

  test('rejects a modern header with a _meta envelope missing the claim key', () => {
    // SDK parity (verified live against classifyInboundRequest): a claim-less
    // `_meta` under a modern header names EVERY absent required envelope key
    // (claim key first, then capabilities) — not just the claim key.
    const body = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
      params: { _meta: { traceparent: 'x' } },
    };
    const err = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
      body
    );
    expect(err.error.code).toBe(-32602);
    expect(err.error.data).toEqual({
      envelope: {
        missing: [
          'io.modelcontextprotocol/protocolVersion',
          'io.modelcontextprotocol/clientCapabilities',
        ],
      },
    });
  });

  test('passes a fully-formed modern request', () => {
    const err = validateHttpRequestMetadata(
      fakeReq({
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/call',
        'mcp-name': 'frodo_discover',
      }),
      modernRequest()
    );
    expect(err).toBeNull();
  });

  test('enforces the full modern check set on modern requests', () => {
    const body = modernRequest();
    // Missing protocol-version header
    expect(
      validateHttpRequestMetadata(fakeReq({ 'mcp-method': 'tools/call', 'mcp-name': 'frodo_discover' }), body)
        .error.code
    ).toBe(-32020);
    // Missing method header
    expect(
      validateHttpRequestMetadata(
        fakeReq({ 'mcp-protocol-version': '2026-07-28', 'mcp-name': 'frodo_discover' }),
        body
      ).error.code
    ).toBe(-32020);
    // Method header disagrees with body
    expect(
      validateHttpRequestMetadata(
        fakeReq({
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
          'mcp-name': 'frodo_discover',
        }),
        body
      ).error.code
    ).toBe(-32020);
    // Missing name header
    expect(
      validateHttpRequestMetadata(
        fakeReq({ 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call' }),
        body
      ).error.code
    ).toBe(-32020);
    // Name header disagrees with body
    expect(
      validateHttpRequestMetadata(
        fakeReq({
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/call',
          'mcp-name': 'other',
        }),
        body
      ).error.code
    ).toBe(-32020);
  });

  test('mirrors params.uri for resources/read under modern rules', () => {
    const body = {
      jsonrpc: '2.0',
      id: 5,
      method: 'resources/read',
      params: {
        uri: 'file:///x',
        _meta: { [META_KEY]: '2026-07-28', [CAPS_KEY]: {} },
      },
    };
    expect(
      validateHttpRequestMetadata(
        fakeReq({
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'resources/read',
          'mcp-name': 'file:///x',
        }),
        body
      )
    ).toBeNull();
    // name-based value does not satisfy uri-mirroring
    expect(
      validateHttpRequestMetadata(
        fakeReq({
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'resources/read',
          'mcp-name': 'file:///y',
        }),
        body
      ).error.code
    ).toBe(-32020);
  });

  test('passes a modern request without Mcp-Name for methods with no name source', () => {
    const body = {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/list',
      params: {
        _meta: { [META_KEY]: '2026-07-28', [CAPS_KEY]: {} },
      },
    };
    expect(
      validateHttpRequestMetadata(
        fakeReq({ 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' }),
        body
      )
    ).toBeNull();
  });

  test('accepts a claim-less notification POST with a modern header, cross-checking method', () => {
    const body = { jsonrpc: '2.0', method: 'notifications/initialized' };
    expect(
      validateHttpRequestMetadata(
        fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
        body
      )
    ).toBeNull();
    expect(
      validateHttpRequestMetadata(
        fakeReq({
          'mcp-protocol-version': '2026-07-28',
          'mcp-method': 'tools/list',
        }),
        body
      ).error.code
    ).toBe(-32020);
  });

  test('rejects a legacy (pre-2026) envelope claim missing clientCapabilities (full-envelope parity)', () => {
    // Option-(b) scope landed: the SDK's validateEnvelopeMeta requires the
    // client-capabilities key on EVERY claimed request, whatever revision the
    // claim names (verified live: a '2025-06-18' claim without caps answers
    // envelope-invalid, not legacy acceptance).
    const body = {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/list',
      params: { _meta: { [META_KEY]: '2025-06-18' } },
    };
    const err = validateHttpRequestMetadata(fakeReq(), body);
    expect(err.error.code).toBe(-32602);
    expect(err.error.message).toBe(
      `Invalid _meta envelope for protocol revision 2026-07-28: ${CAPS_KEY}: missing`
    );
    expect(err.error.data).toEqual({
      envelope: { key: CAPS_KEY, problem: 'missing' },
    });
  });

  test('passes a string non-modern claim WITH clientCapabilities (the LiteLLM shape, SDK-verified)', () => {
    // A claim naming a pre-2026 revision plus a present (object) capabilities
    // key passes the SDK's full envelope validation and classifies
    // legacy-era traffic — accepted without modern headers.
    const body = {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'frodo_discover',
        _meta: { [META_KEY]: '2025-11-25', [CAPS_KEY]: {} },
      },
    };
    expect(validateHttpRequestMetadata(fakeReq(), body)).toBeNull();
  });

  test('reports clientCapabilities: missing FIRST for a compound shape (non-string claim, no caps) — SDK missing-keys-first order', () => {
    // SDK parity (verified live against classifyInboundRequest +
    // validateEnvelopeMeta): a claimed _meta carrying a number revision and
    // no capabilities key answers `clientCapabilities: missing` — the
    // missing-keys check runs before the present keys' schema validation —
    // not the claim's type error. The comment above firstEnvelopeIssue
    // always described this order; the check order now matches it.
    const body = {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'x', _meta: { [META_KEY]: 12345 } },
    };
    const err = validateHttpRequestMetadata(fakeReq(), body);
    expect(err.error.code).toBe(-32602);
    expect(err.error.message).toBe(
      `Invalid _meta envelope for protocol revision 2026-07-28: ${CAPS_KEY}: missing`
    );
    expect(err.error.data).toEqual({
      envelope: { key: CAPS_KEY, problem: 'missing' },
    });
    // And the same shape under a modern header stays the caps-missing cell.
    const withHeader = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
      body
    );
    expect(withHeader.error.code).toBe(-32602);
    expect(withHeader.error.message).toBe(
      `Invalid _meta envelope for protocol revision 2026-07-28: ${CAPS_KEY}: missing`
    );
  });

  test.each([
    [12345, 'number'],
    [{ nested: true }, 'object'],
    [null, 'null'],
    [true, 'boolean'],
    [['2026-07-28'], 'array'],
  ])(
    'rejects a present-but-non-string envelope claim (%p) with the SDK envelope-invalid shape (when the envelope is otherwise complete)',
    (claimValue, receivedType) => {
      // Before the malformed-claim fix, this body silently downgraded to
      // legacy handling: hasClaim=true but version=undefined made
      // isModernProtocolVersion(undefined) false, skipping every modern
      // cross-check. SDK parity: envelope-invalid, 400 -32602. The type
      // error only surfaces once the envelope is otherwise complete (the
      // capabilities key present) — see the compound-shape cell above for
      // the missing-caps-first ordering.
      const body = {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'x',
          _meta: { [META_KEY]: claimValue, [CAPS_KEY]: {} },
        },
      };
      const err = validateHttpRequestMetadata(fakeReq(), body);
      expect(err.error.code).toBe(-32602);
      expect(err.statusCode).toBe(400);
      expect(err.error.message).toBe(
        `Invalid _meta envelope for protocol revision 2026-07-28: ${META_KEY}: Invalid input: expected string, received ${receivedType}`
      );
      expect(err.error.data).toEqual({
        envelope: {
          key: META_KEY,
          problem: `Invalid input: expected string, received ${receivedType}`,
        },
      });
    }
  );

  test('rejects a non-string claim on a notification (notification-envelope-invalid parity, the only notification envelope rejection)', () => {
    // SDK classifyNotificationBody parity (verified live): a notification
    // whose claim value is not a string is rejected -32602 with the CLAIM
    // KEY's type error — the .find(key === PROTOCOL_VERSION_META_KEY)
    // lookup means a missing capabilities key is never reported here.
    const body = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: { _meta: { [META_KEY]: { nested: 1 } } },
    };
    const err = validateHttpRequestMetadata(fakeReq(), body);
    expect(err.error.code).toBe(-32602);
    expect(err.error.message).toBe(
      `Invalid _meta envelope for protocol revision 2026-07-28: ${META_KEY}: Invalid input: expected string, received object`
    );
    expect(err.error.data).toEqual({
      envelope: {
        key: META_KEY,
        problem: 'Invalid input: expected string, received object',
      },
    });
  });

  test.each([
    ['a modern claim', '2026-07-28'],
    ['a legacy-dated claim', '2025-06-18'],
  ])(
    'serves a notification carrying %s with NO clientCapabilities key (SDK classifyNotificationBody parity)',
    (_label, claimValue) => {
      // Verified live against classifyInboundRequest: claimed notifications
      // require ONLY a string claim — no capabilities key (kind=modern,
      // messageKind=notification, whatever the claim's revision). The old
      // full-envelope check rejected these -32602; the SDK serves them.
      const body = {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: { _meta: { [META_KEY]: claimValue } },
      };
      expect(validateHttpRequestMetadata(fakeReq(), body)).toBeNull();
    }
  );

  test('notification header/body version cross-check fires on a claim (SDK notification-header-body-version-mismatch parity)', () => {
    // Verified live: a notification whose claim names a different revision
    // than the header is a -32020 mismatch, whatever era the claim names.
    const body = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: { _meta: { [META_KEY]: '2025-06-18' } },
    };
    const err = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
      body
    );
    expect(err.error.code).toBe(-32020);
  });

  test('ignores a mismatched Mcp-Method header on a legacy-era notification (SDK parity)', () => {
    // Verified live (classifyNotificationBody): the method cross-check
    // fires only for modern-classified notifications — a legacy-dated
    // claim, or a claim-less notification with no modern header, serves
    // despite a stray Mcp-Method header.
    const body = {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: { _meta: { [META_KEY]: '2025-06-18' } },
    };
    expect(
      validateHttpRequestMetadata(fakeReq({ 'mcp-method': 'tools/call' }), body)
    ).toBeNull();
  });

  test('still legacy-accepts an initialize with a malformed claim and no modern header (SDK precedence)', () => {
    // The SDK's initialize precedence rule checks a VALID modern envelope
    // claim; a malformed claim keeps the legacy-handshake classification
    // (verified against classifyInboundRequest) — frodo must not start
    // rejecting legacy-era initialize traffic over a stray _meta key.
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', _meta: { [META_KEY]: 12345 } },
    };
    expect(validateHttpRequestMetadata(fakeReq(), body)).toBeNull();
  });

  test('still rejects an initialize with a malformed claim and a modern header (-32020 precedence)', () => {
    // initialize-with-modern-header is the first rejection on the SDK's
    // ladder for this shape — the malformed claim never gets to win.
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', _meta: { [META_KEY]: 12345 } },
    };
    const err = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
      body
    );
    expect(err.error.code).toBe(-32020);
  });

  test('rejects a malformed claim even when a modern header would otherwise pair with it', () => {
    // The regression cell from review: a modern header + non-string claim
    // must not skip the modern checks, and the claim's own malformedness is
    // the error that fires (with the capabilities key present, so the
    // type error is the first issue — see the compound-shape cell).
    const body = {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: {
        name: 'x',
        _meta: { [META_KEY]: 12345, [CAPS_KEY]: {} },
      },
    };
    const err = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
      body
    );
    expect(err.error.code).toBe(-32602);
    expect(err.error.message).toContain('Invalid input: expected string, received number');
  });

  test.each([
    ['a string _meta', 'not-an-object'],
    ['a null _meta', null],
    ['an array _meta', ['2026-07-28']],
    ['a number _meta', 7],
  ])(
    'treats params._meta that is %s as claim-less (no false -32602, no false -32020)',
    (_label, metaValue) => {
      // getRequestParams guards _meta to a plain object; a non-object _meta
      // carries no envelope claim at all, so with no modern header this is
      // legacy traffic — never the malformed-claim rejection (the claim key
      // is not even reachable inside a non-object _meta). (The SDK's own
      // body schema rejects these shapes outright as invalid JSON-RPC; frodo
      // forwards them to the transport per the P1 body-shape decision, so
      // the metadata gate itself stays claim-less-silent here.)
      const body = {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'x', _meta: metaValue },
      };
      expect(validateHttpRequestMetadata(fakeReq(), body)).toBeNull();
      // And with a modern header it is the modern-header-without-claim
      // cell (-32602), not a malformed-claim error. A non-object _meta is
      // not an envelope at all, so the missing list is ['_meta'] (SDK
      // parity: meta === undefined => missing = ['_meta']).
      const withHeader = validateHttpRequestMetadata(
        fakeReq({ 'mcp-protocol-version': '2026-07-28' }),
        body
      );
      expect(withHeader.error.code).toBe(-32602);
      expect(withHeader.error.data).toEqual({
        envelope: { missing: ['_meta'] },
      });
    }
  );
});

// ---------------------------------------------------------------------------
// Server-mode crash handlers (scoped to the MCP server start path)
// ---------------------------------------------------------------------------

describe('registerServerCrashHandlers', () => {
  // Registration is guarded by process.listenerCount('uncaughtException')
  // === 0, so these tests assert the guard, the dispose contract, and the
  // crash-line shape. The uncaughtException exit(1) path cannot run inside
  // the jest worker (it would kill the suite); the spawned-child test
  // (FRODO_MCP_CRASH_TEST) exercises it against the built dist instead.
  // Unhandled promise rejections are deliberately NOT registered here:
  // FrodoCommand's constructor installs a global unhandledRejection handler
  // before any transport start path runs, so rejections in server mode are
  // owned by FrodoCommand (logged + exitCode 1) — a scoped registration
  // could only ever stack behind it.
  let savedExitCode;

  beforeEach(() => {
    savedExitCode = process.exitCode;
  });

  afterEach(() => {
    process.exitCode = savedExitCode;
  });

  test('registers exactly one uncaughtException handler when none exist', () => {
    const beforeException = process.listenerCount('uncaughtException');
    const dispose = registerServerCrashHandlers();
    if (beforeException === 0) {
      expect(process.listenerCount('uncaughtException')).toBe(1);
    } else {
      // Guard parity: an existing handler (FrodoCommand's, or another
      // transport's) suppresses the scoped registration entirely.
      expect(process.listenerCount('uncaughtException')).toBe(beforeException);
    }
    dispose();
  });

  test('never registers an unhandledRejection handler (FrodoCommand owns rejections)', () => {
    // FrodoCommand's constructor registers the global unhandledRejection
    // handler during command-tree assembly — before any startHttpTransport
    // call — so the old listenerCount-guarded rejection registration was
    // dead code on every CLI path (review finding). The scoped handler
    // covers only uncaughtException; a rejection inside the jest worker
    // reaches FrodoCommand's handler, not this one.
    const beforeRejection = process.listenerCount('unhandledRejection');
    const dispose = registerServerCrashHandlers();
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection);
    dispose();
  });

  test('dispose removes exactly the handler it added (re-start re-registers cleanly)', () => {
    const beforeException = process.listenerCount('uncaughtException');
    const beforeRejection = process.listenerCount('unhandledRejection');
    const dispose = registerServerCrashHandlers();
    dispose();
    expect(process.listenerCount('uncaughtException')).toBe(beforeException);
    expect(process.listenerCount('unhandledRejection')).toBe(beforeRejection);
    // Idempotent dispose.
    dispose();
    expect(process.listenerCount('uncaughtException')).toBe(beforeException);
  });

  test('skips registration when an uncaughtException handler already exists (guard parity)', () => {
    const fake = () => {};
    process.on('uncaughtException', fake);
    const countBefore = process.listenerCount('uncaughtException');
    const dispose = registerServerCrashHandlers();
    expect(process.listenerCount('uncaughtException')).toBe(countBefore);
    process.off('uncaughtException', fake);
    dispose();
  });

  test('the crash line carries name, message, and first stack frame', () => {
    // The crash-line shape is shared by every crash log; exercised through
    // the uncaughtException handler itself (registered here when the worker
    // has none, so emitting dispatches only to handlers this suite added —
    // all log-and-continue in the worker because process.exit is stubbed
    // below; a real exit(1) would kill the suite).
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined);
    const dispose = registerServerCrashHandlers();
    try {
      process.emit('uncaughtException', new TypeError('typed-probe'));
      const line = printed.find((p) => p.msg.includes('typed-probe'));
      expect(line).toBeDefined();
      expect(line.type).toBe('error');
      expect(line.msg).toContain('TypeError: typed-probe');
      expect(line.msg).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(line.msg).toMatch(/\(at .+/);
      // The deliberate exit is part of the contract.
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      exitSpy.mockRestore();
      dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// HTTP integration through the real listener
// ---------------------------------------------------------------------------

describe('startHttpTransport', () => {
  beforeEach(() => {
    printed.length = 0;
  });

  afterEach(async () => {
    // Release any listener this test started and restore default signal
    // disposition for subsequent tests.
    await shutdownTransport();
  });

  let currentDone = null;
  async function shutdownTransport() {
    if (currentDone) {
      const done = currentDone;
      currentDone = null;
      // process.emit, not process.kill: jest replaces the worker's process
      // object, so real OS signals never reach handlers registered in tests
      // (the worker just dies). Emitting dispatches to the registered
      // handlers synchronously, exactly what the shutdown closure needs.
      process.emit('SIGTERM', 'SIGTERM');
      await done;
    }
  }

  // Debug-level gate logging is emitted through printMessage(msg, 'debug')
  // in the unit setup (no startupInfo). The McpLogger maps winston 'debug'
  // to stderr as "[frodo-mcp] debug: http: <message>" — here the Console
  // mock records { msg, type }, so debug lines are the 'debug'-typed entries.
  function debugLines() {
    return printed.filter((p) => p.type === 'debug');
  }

  test('serves /health unauthenticated and stateless', async () => {
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port, { authToken: 'tok123' });
    await waitForListening('127.0.0.1', port);
    const res = await rawRequest(port, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toEqual({ status: 'ok' });
  });

  test('enforces the bearer token on /mcp and never on /health', async () => {
    const port = await getFreePort();
    const body = legacyInitializeBody();
    currentDone = startServer('127.0.0.1', port, { authToken: 'tok123' });
    await waitForListening('127.0.0.1', port);

    const missing = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, body);
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
    const missingPayload = JSON.parse(missing.text);
    expect(missingPayload.error.code).toBe(-32001);

    const wrong = await rawRequest(port, 'POST', '/mcp', { ...JSON_HEADERS, authorization: 'Bearer nope' }, body);
    expect(wrong.status).toBe(401);

    // With the token, both gates pass and the SDK transport answers the
    // initialize itself.
    const ok = await rawRequest(port, 'POST', '/mcp', { ...JSON_HEADERS, authorization: 'Bearer tok123' }, body);
    expect(ok.status).toBe(200);
  }, 30000);

  test('serves a 2025-era initialize without any modern metadata headers', async () => {
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody());
    expect(res.status).toBe(200);
    // The SDK answers an initialize with an SSE stream (the Accept header
    // includes text/event-stream), carrying one `data:` line: the result.
    const dataLine = res.text.split('\n').find((l) => l.startsWith('data: '));
    const payload = JSON.parse(dataLine.replace(/^data: /, ''));
    expect(payload.result.serverInfo.name).toBe('frodo-mcp');
  }, 30000);

  test('rejects an unknown initialize protocol version with -32022', async () => {
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody('1999-01-01'));
    expect(res.status).toBe(400);
    expect(res.text).toContain('-32022');
  }, 30000);

  test('rejects an empty JSON-RPC batch with 400 -32600 (SDK empty-batch parity)', async () => {
    // Before the fix the hand-wired transport silently answered 202 for [].
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, '[]');
    expect(res.status).toBe(400);
    const payload = JSON.parse(res.text);
    expect(payload.error.code).toBe(-32600);
    expect(payload.error.message).toBe('Bad Request: empty JSON-RPC batch');
    expect(payload.id).toBeNull();
  }, 30000);

  test('forwards a non-empty legacy JSON-RPC batch to the transport (existing behavior)', async () => {
    // classifyBatch parity: only the empty array is a batch-shaped
    // rejection; a batch of legacy elements keeps reaching the transport,
    // which answers the initialize element itself.
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const initialize = JSON.parse(legacyInitializeBody());
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, JSON.stringify([initialize]));
    expect(res.status).toBe(200);
    const dataLine = res.text.split('\n').find((l) => l.startsWith('data: '));
    const payload = JSON.parse(dataLine.replace(/^data: /, ''));
    expect(payload.result.serverInfo.name).toBe('frodo-mcp');
  }, 30000);

  test('rejects a compound envelope shape (non-string claim, no caps) with caps-missing first, end to end (SDK parity)', async () => {
    // The QA reproduction, updated to the SDK's missing-keys-first order:
    // before this fix a claimed _meta carrying a number revision and no
    // capabilities key answered the claim's type error; the SDK reports
    // `clientCapabilities: missing` (verified live: validateEnvelopeMeta
    // lists the missing key first and classifyInboundRequest reports the
    // first issue). A non-string claim WITH the capabilities key still
    // answers the type error (the sibling unit cell covers that shape).
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'frodo_discover',
        arguments: {},
        _meta: { 'io.modelcontextprotocol/protocolVersion': 12345 },
      },
    });
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, body);
    expect(res.status).toBe(400);
    const payload = JSON.parse(res.text);
    expect(payload.error.code).toBe(-32602);
    expect(payload.error.message).toBe(
      'Invalid _meta envelope for protocol revision 2026-07-28: io.modelcontextprotocol/clientCapabilities: missing'
    );
    expect(payload.error.data).toEqual({
      envelope: {
        key: 'io.modelcontextprotocol/clientCapabilities',
        problem: 'missing',
      },
    });
  }, 30000);

  test('serves a claimed notification without clientCapabilities (SDK classifyNotificationBody parity)', async () => {
    // Verified live: the SDK serves a notification whose envelope claim
    // names any revision with no capabilities key (kind=modern,
    // messageKind=notification). The old full-envelope check answered
    // -32602 for these; notifications get only the claim-string semantics.
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const res = await rawRequest(
      port,
      'POST',
      '/mcp',
      JSON_HEADERS,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {
          _meta: { [META]: '2026-07-28' },
        },
      })
    );
    // The SDK transport answers a notification with 202 and no body.
    expect(res.status).toBe(202);
  }, 30000);

  test('rejects a non-string claim on a notification with 400 -32602 (claim-key problem, SDK parity)', async () => {
    // The one notification envelope rejection the SDK has: a claim whose
    // value is not a string, keyed on the claim key's own type error.
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const res = await rawRequest(
      port,
      'POST',
      '/mcp',
      JSON_HEADERS,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {
          _meta: { [META]: { nested: 1 } },
        },
      })
    );
    expect(res.status).toBe(400);
    const payload = JSON.parse(res.text);
    expect(payload.error.code).toBe(-32602);
    expect(payload.error.message).toBe(
      `Invalid _meta envelope for protocol revision 2026-07-28: ${META}: Invalid input: expected string, received object`
    );
  }, 30000);

  test('SIGHUP and SIGQUIT release the listener, log the signal, and resolve the promise', async () => {
    for (const signal of ['SIGHUP', 'SIGQUIT']) {
      const port = await getFreePort();
      printed.length = 0;
      const done = startHttpTransport({ listTools: () => [] }, '127.0.0.1', port);
      await waitForListening('127.0.0.1', port);
      // Emit with the signal name: a real OS signal delivers the name to
      // signal handlers, but a bare process.emit('SIGHUP') passes no
      // argument (Node 24), so the name must be passed explicitly here.
      process.emit(signal, signal);
      await done;
      // Signal receipt is logged (the only record of WHY the server went
      // down when shutdown is triggered remotely). At-least-one rather than
      // exactly-one: jest's shared worker process has accumulated shutdown
      // handlers from every transport this suite started, so one emit
      // dispatches to all of them (each logs its own line).
      const signalLines = printed.filter(
        (p) => p.type === 'info' && p.msg === `received ${signal}, shutting down MCP HTTP server`
      );
      expect(signalLines.length).toBeGreaterThanOrEqual(1);
      // Port released: a fresh bind on the same port must succeed.
      const rebind = await new Promise((resolve, reject) => {
        const server = http.createServer();
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.close(() => resolve(true));
        });
      });
      expect(rebind).toBe(true);
    }
  }, 30000);

  test('EADDRINUSE prints one actionable message and resolves with exit code 1', async () => {
    const port = await getFreePort();
    const incumbent = http.createServer();
    await new Promise((r) => incumbent.listen(port, '127.0.0.1', r));
    try {
      const exitCodeBefore = process.exitCode;
      printed.length = 0;
      const done = startHttpTransport({ listTools: () => [] }, '127.0.0.1', port);
      await expect(done).resolves.toBeUndefined();
      expect(process.exitCode).toBe(1);
      const errorLines = printed.filter((p) => p.type === 'error');
      expect(errorLines).toHaveLength(1);
      expect(errorLines[0].msg).toContain(`port ${port} on 127.0.0.1 is already in use`);
      expect(errorLines[0].msg).toContain('lsof');
      expect(errorLines[0].msg).toContain('--port');
      // A plain TCP squatter (no /health endpoint) does NOT claim an MCP
      // server is answering — the health probe must gate that variant.
      expect(errorLines[0].msg).not.toContain('another MCP server is answering');
      process.exitCode = exitCodeBefore;
    } finally {
      incumbent.close();
    }
  }, 30000);

  test('EADDRINUSE names a live MCP incumbent when its /health answers', async () => {
    const port = await getFreePort();
    // A minimal stand-in MCP incumbent: an HTTP server answering GET /health
    // with 200 — exactly what a real frodo mcp server (or any conforming
    // liveness endpoint) gives the probe.
    const incumbent = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise((r) => incumbent.listen(port, '127.0.0.1', r));
    try {
      const exitCodeBefore = process.exitCode;
      printed.length = 0;
      const done = startHttpTransport({ listTools: () => [] }, '127.0.0.1', port);
      await expect(done).resolves.toBeUndefined();
      expect(process.exitCode).toBe(1);
      const errorLines = printed.filter((p) => p.type === 'error');
      expect(errorLines).toHaveLength(1);
      expect(errorLines[0].msg).toContain(
        'another MCP server is answering on this port'
      );
      // The lsof hint still covers discovery (no PID claim — the incumbent
      // process is not this process's child).
      expect(errorLines[0].msg).toContain('lsof');
      process.exitCode = exitCodeBefore;
    } finally {
      incumbent.close();
    }
  }, 30000);

  test('the listening line carries the server PID', async () => {
    const port = await getFreePort();
    printed.length = 0;
    const done = startHttpTransport({ listTools: () => [] }, '127.0.0.1', port);
    try {
      await waitForListening('127.0.0.1', port);
      const listening = printed.find((p) => p.msg.includes('listening on'));
      expect(listening).toBeDefined();
      expect(listening.msg).toBe(
        `MCP HTTP server (pid ${process.pid}) listening on http://127.0.0.1:${port}/mcp`
      );
    } finally {
      currentDone = done;
      await shutdownTransport();
    }
  }, 30000);

  test('the heartbeat interval logs a liveness line and is cleared on shutdown', async () => {
    // The production interval is 15 minutes — far beyond a test's patience,
    // and jest fake timers installed after startHttpTransport would not
    // capture an interval created under real timers. The interval is
    // injectable (options.heartbeatIntervalMs), so this drives the real
    // emission/clearing lifecycle with a 40ms period against real timers.
    const port = await getFreePort();
    printed.length = 0;
    const done = startServer('127.0.0.1', port, { heartbeatIntervalMs: 40 });
    await waitForListening('127.0.0.1', port);
    try {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      await sleep(100);
      const beats = printed.filter((p) => p.msg.includes('still listening'));
      expect(beats.length).toBeGreaterThanOrEqual(1);
      expect(beats[0].msg).toBe(
        `MCP HTTP server still listening on http://127.0.0.1:${port}/mcp (pid ${process.pid})`
      );
      // Shutdown clears the interval: after the transport stops, no further
      // beats accumulate.
      currentDone = done;
      await shutdownTransport();
      const beatsAtShutdown = printed.filter((p) => p.msg.includes('still listening')).length;
      await sleep(120);
      expect(printed.filter((p) => p.msg.includes('still listening'))).toHaveLength(
        beatsAtShutdown
      );
    } catch (err) {
      // Make sure a failure doesn't strand the listener.
      currentDone = done;
      await shutdownTransport();
      throw err;
    }
  }, 30000);


  test('a POST to /mcp with a query string reaches the endpoint (query-param routing)', async () => {
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    // The pre-fix router compared req.url !== '/mcp', 404ing any query string;
    // RFC 9110: the query is not part of the path, and gateways append
    // trace/correlation parameters.
    const res = await rawRequest(
      port,
      'POST',
      '/mcp?source=gateway&requestId=abc123',
      JSON_HEADERS,
      legacyInitializeBody()
    );
    expect(res.status).toBe(200);
    const dataLine = res.text.split('\n').find((l) => l.startsWith('data: '));
    const payload = JSON.parse(dataLine.replace(/^data: /, ''));
    expect(payload.result.serverInfo.name).toBe('frodo-mcp');
    // The path check now ignores the query string on BOTH routes: /health
    // with a query answers 200 like the bare path (RFC 9110 — the query is
    // not part of the path), and unknown paths stay 404.
    const health = await rawRequest(port, 'GET', '/health');
    expect(health.status).toBe(200);
    const healthQuery = await rawRequest(port, 'GET', '/health?probe=1');
    expect(healthQuery.status).toBe(200);
    const notFound = await rawRequest(port, 'GET', '/other?x=1');
    expect(notFound.status).toBe(404);
    const notFoundQuery = await rawRequest(port, 'GET', '/other?x=1');
    expect(notFoundQuery.status).toBe(404);
  }, 30000);

  test('a non-empty batch containing ANY claimed element is rejected -32600 (batch-with-modern-element parity)', async () => {
    // SDK classifyBatch parity (verified live): a batch with any element
    // carrying an envelope claim — valid modern, malformed, legacy-dated, or
    // a claimed notification — answers 400 -32600 with the SDK's exact
    // wording. Presence-only: the claim's validity is never consulted.
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const cases = {
      'valid modern claim': {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: { [META]: PV, [CAPS]: {} },
        },
      },
      'malformed claim': {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: { _meta: { [META]: 12345 } },
      },
      'legacy-dated claim': {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: { _meta: { [META]: '2025-11-25', [CAPS]: {} } },
      },
      'claimed notification element': {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: { _meta: { [META]: PV, [CAPS]: {} } },
      },
    };
    for (const [label, element] of Object.entries(cases)) {
      const res = await rawRequest(
        port,
        'POST',
        '/mcp',
        JSON_HEADERS,
        JSON.stringify([
          { jsonrpc: '2.0', id: 90, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {} } },
          element,
        ])
      );
      expect(res.status).toBe(400);
      const payload = JSON.parse(res.text);
      expect(payload.error.code).toBe(-32600);
      expect(payload.error.message).toBe(
        'Bad Request: JSON-RPC batches may not contain requests for protocol revision 2026-07-28 or later'
      );
      expect(payload.id).toBeNull();
    }
  }, 30000);

  test('a modern claim missing clientCapabilities is rejected -32602 with the SDK envelope-invalid wording', async () => {
    // The claim-only-modern regression cell, updated for full envelope
    // validation: before this change a request carrying ONLY the claim key
    // was accepted (P1 deferral); the SDK requires the capabilities key on
    // every claimed request and answers exactly this message.
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'frodo_discover',
        arguments: {},
        _meta: { [META]: PV },
      },
    });
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, body);
    expect(res.status).toBe(400);
    const payload = JSON.parse(res.text);
    expect(payload.error.code).toBe(-32602);
    expect(payload.error.message).toBe(
      `Invalid _meta envelope for protocol revision 2026-07-28: ${CAPS}: missing`
    );
    expect(payload.error.data).toEqual({
      envelope: { key: CAPS, problem: 'missing' },
    });
  }, 30000);

  test('an initialize with a modern claim but no clientCapabilities stays legacy (SDK precedence, end to end)', async () => {
    // SDK parity probe: carriesValidModernEnvelopeClaim requires a FULLY
    // valid envelope, so an initialize whose _meta claims a modern revision
    // without the capabilities key classifies as the legacy handshake and is
    // ANSWERED (the SDK negotiates 2025-era initialize) — not rejected.
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port);
    await waitForListening('127.0.0.1', port);
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 't', version: '1' },
        _meta: { [META]: PV },
      },
    });
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, body);
    expect(res.status).toBe(200);
    const dataLine = res.text.split('\n').find((l) => l.startsWith('data: '));
    const payload = JSON.parse(dataLine.replace(/^data: /, ''));
    expect(payload.result.serverInfo.name).toBe('frodo-mcp');
    // The initialize version is honored (not a -32020 or -32602 rejection).
    expect(payload.result.protocolVersion).toBe('2025-06-18');
  }, 30000);

  test('the -32020 presence messages keep origin/main header capitalization', () => {
    // The era gate rewrote the presence messages with wire-lowercased header
    // names ("Missing required mcp-protocol-version header."); origin/main's
    // text capitalized the well-known names. Existing log-greps and test
    // snapshots match the capitalized forms, so the well-known headers
    // restore them (the generic fallthrough keeps the wire spelling).
    const fakeReq = (headers = {}) => ({ headers });
    // Build the mismatch cells:
    const pvHeader = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'frodo_discover',
        _meta: { [META]: PV, [CAPS]: {} },
      },
    };
    const missingProtocolVersion = validateHttpRequestMetadata(
      fakeReq({ 'mcp-method': 'tools/call', 'mcp-name': 'frodo_discover' }),
      pvHeader
    );
    expect(missingProtocolVersion.error.message).toBe(
      'Missing required MCP-Protocol-Version header.'
    );
    const missingMethod = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28', 'mcp-name': 'frodo_discover' }),
      pvHeader
    );
    expect(missingMethod.error.message).toBe('Missing required Mcp-Method header.');
    const missingName = validateHttpRequestMetadata(
      fakeReq({ 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/call' }),
      pvHeader
    );
    expect(missingName.error.message).toBe(
      'Missing required Mcp-Name header.'
    );
  });

  test('gate decisions are logged at debug level (unauthorized, host, acceptance)', async () => {
    // The per-request gate observability contract: an operator at
    // --mcp-log-level debug can tell "requests arrive and are rejected at a
    // gate" from "requests never arrive". Each decision point emits one
    // line; token/authorization VALUES are never logged (presence only).
    const port = await getFreePort();
    currentDone = startServer('127.0.0.1', port, { authToken: 'tok123' });
    await waitForListening('127.0.0.1', port);
    const body = legacyInitializeBody();

    // Unauthorized POST (no header): gate line without any header material.
    const missing = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, body);
    expect(missing.status).toBe(401);
    const unauthorizedLines = debugLines().filter((p) =>
      p.msg.includes('rejected: unauthorized')
    );
    expect(unauthorizedLines.length).toBeGreaterThanOrEqual(1);
    expect(
      unauthorizedLines.some((p) => p.msg.includes('no Authorization header'))
    ).toBe(true);
    // The secret token value must never appear in any log line.
    expect(printed.some((p) => p.msg.includes('tok123'))).toBe(false);

    // Wrong token: presence is logged, contents are not.
    await rawRequest(
      port,
      'POST',
      '/mcp',
      { ...JSON_HEADERS, authorization: 'Bearer wrong-value' },
      body
    );
    expect(
      debugLines().some((p) =>
        p.msg.includes('Authorization header did not verify')
      )
    ).toBe(true);
    expect(printed.some((p) => p.msg.includes('wrong-value'))).toBe(false);

    // Accepted request: one arrival line + one acceptance line.
    await rawRequest(
      port,
      'POST',
      '/mcp',
      { ...JSON_HEADERS, authorization: 'Bearer tok123' },
      body
    );
    expect(debugLines().some((p) => p.msg.includes('accepted from'))).toBe(true);
    expect(
      debugLines().some((p) => p.msg.includes('POST /mcp from'))
    ).toBe(true);

    // Host rejection: a bad Host header is named by the gate line.
    const badHost = await rawRequest(
      port,
      'POST',
      '/mcp',
      { ...JSON_HEADERS, authorization: 'Bearer tok123', host: 'evil.example.com' },
      body
    );
    expect(badHost.status).toBe(403);
    expect(
      debugLines().some((p) => p.msg.includes('rejected: invalid Host header'))
    ).toBe(true);

    // The arrival line logs the route path only: a caller that puts secret
    // material in a query parameter must not see it echoed into the log.
    await rawRequest(
      port,
      'POST',
      '/mcp?token=supersecret&correlationId=x',
      { ...JSON_HEADERS, authorization: 'Bearer tok123' },
      body
    );
    const arrivalWithQuery = debugLines().find((p) =>
      p.msg.includes('token=supersecret')
    );
    expect(arrivalWithQuery).toBeUndefined();
    expect(
      debugLines().some(
        (p) => p.msg.includes('POST /mcp from') && !p.msg.includes('?')
      )
    ).toBe(true);
  }, 30000);

  test('gate logging stays silent at the default (info) level contract', async () => {
    // The DEBUG marker is what gates the output: production runs default to
    // --mcp-log-level info, and the logger's own level filter (McpLogger
    // constructor: level 'info' drops debug records) is what keeps stdout
    // quiet. Here assert the unit-level counterpart: every debug line the
    // transport emits is typed 'debug' (never 'info'/'error'), so wiring the
    // real logger at info cannot leak these lines.
    const port = await getFreePort();
    printed.length = 0;
    currentDone = startServer('127.0.0.1', port, { authToken: 'tok123' });
    await waitForListening('127.0.0.1', port);
    await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody());
    const nonDebugGateLines = printed.filter(
      (p) =>
        (p.msg.includes('rejected:') || p.msg.includes('accepted from')) &&
        p.type !== 'debug'
    );
    expect(nonDebugGateLines).toEqual([]);
    const arrival = debugLines().find((p) => p.msg.includes('POST /mcp'));
    expect(arrival).toBeDefined();
  }, 30000);
});

// ---------------------------------------------------------------------------
// Launcher signal forwarding (src/launch.ts, the dist/launch.cjs wrapper)
// ---------------------------------------------------------------------------

describe('launcher signal forwarding', () => {
  // The wrapper (launch.ts) spawns the CLI child with stdio inherit and has
  // no session of its own; a signal delivered to only the wrapper (closing
  // SSH session -> SIGHUP, `kill <wrapper-pid>` -> SIGTERM) must reach the
  // child, or a long-running `frodo mcp server start` outlives its parent
  // and holds the port. Driven against the built dist/launch.cjs running the
  // real `mcp server start --transport http` (the listener comes up without
  // a tenant connection), signaling the WRAPPER process.
  const { spawn } = childProcess;
  const fs = fsPromise;
  const os = osPromise;
  const path = pathPromise;
  const launchPath = path.resolve('dist/launch.cjs');
  const hasDist = fs.existsSync(launchPath);

  const cond = (name, fn) => (hasDist ? test(name, fn, 60000) : test.skip(name, fn));

  cond('SIGHUP to the wrapper reaches the child, which exits and releases the port', async () => {
    const port = await getFreePort();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-launch-'));
    const profilesPath = path.join(tmpDir, 'Connections.json');
    fs.writeFileSync(profilesPath, JSON.stringify({}));
    const child = spawn(
      process.execPath,
      [launchPath, 'mcp', 'server', 'start', '--transport', 'http', '--port', String(port)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, FRODO_TEST: '1', NO_COLOR: '1', FRODO_CONNECTION_PROFILES_PATH: profilesPath },
      }
    );
    try {
      await waitForListening('127.0.0.1', port, 30000);
      // Signal the WRAPPER, not the child: the forwarding under test. The
      // child exits on the forwarded SIGHUP (its graceful-shutdown handler
      // resolves the transport promise, then the process unwinds) — the
      // wrapper's exit reflects the child's.
      process.kill(child.pid, 'SIGHUP');
      const [code, signal] = await new Promise((resolve) =>
        child.once('exit', (c, s) => resolve([c, s]))
      );
      expect(code ?? signal).not.toBeNull();
      // Port released: a fresh bind on the same port must succeed.
      const rebind = await new Promise((resolve, reject) => {
        const server = http.createServer();
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
      });
      expect(rebind).toBe(true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// UncaughtException crash path, end to end (FRODO_MCP_CRASH_TEST probe)
// ---------------------------------------------------------------------------

describe('uncaughtException crash path (spawned child)', () => {
  // The uncaughtException handler exits the process (by contract), so it
  // cannot be exercised inside the jest worker. FRODO_MCP_CRASH_TEST=1 (a
  // test/debug-only env hook documented in docs/MCP_CLIENT_SETUP.md) makes
  // the HTTP server throw an uncaught exception shortly after listening, so
  // the full path — one timestamped crash line, best-effort port release,
  // exit 1 — runs in the real compiled dist against the real launch wrapper.
  // Skipped when dist is absent (the launcher-test pattern).
  const { spawn } = childProcess;
  const fs = fsPromise;
  const os = osPromise;
  const path = pathPromise;
  const launchPath = path.resolve('dist/launch.cjs');
  const hasDist = fs.existsSync(launchPath);

  const cond = (name, fn) => (hasDist ? test(name, fn, 60000) : test.skip(name, fn));

  cond('an uncaught exception logs one crash line, exits 1, and releases the port', async () => {
    const port = await getFreePort();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-crash-'));
    const profilesPath = path.join(tmpDir, 'Connections.json');
    fs.writeFileSync(profilesPath, JSON.stringify({}));
    const child = spawn(
      process.execPath,
      [launchPath, 'mcp', 'server', 'start', '--transport', 'http', '--port', String(port)],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FRODO_TEST: '1',
          NO_COLOR: '1',
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
          FRODO_MCP_CRASH_TEST: '1',
        },
      }
    );
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    try {
      const [code, signal] = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve([null, 'timeout']), 45000);
        child.once('exit', (c, s) => {
          clearTimeout(timer);
          resolve([c, s]);
        });
      });
      // The crash handler's deliberate exit(1): the process must not be
      // killed by an unhandled signal or left running to the timeout.
      expect([code, signal]).not.toEqual([null, 'timeout']);
      expect(code).toBe(1);
      // One timestamped crash line, naming the probe error.
      const crashLines = stderr
        .split('\n')
        .filter((line) => line.includes('uncaughtException: Error:'));
      expect(crashLines.length).toBe(1);
      expect(crashLines[0]).toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(crashLines[0]).toContain('FRODO_MCP_CRASH_TEST uncaught exception probe');
      // Port released by the best-effort beforeExit close: a fresh bind on
      // the same port must succeed (a supervisor restart must not hit
      // EADDRINUSE against our own corpse).
      const rebind = await new Promise((resolve, reject) => {
        const server = http.createServer();
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
      });
      expect(rebind).toBe(true);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// `mcp server stop` against spawned dist children (the real CLI + lockfile +
// stop command, end to end). The stop command signals a process by PID, which
// cannot be exercised in-process, so like the launcher/crash cells above this
// suite drives the compiled dist and is skipped when dist is absent. Every
// cell gets its own temp FRODO_CONFIG_PATH (the lockfile lives there) and
// kills its spawned server in finally.
// ---------------------------------------------------------------------------

describe('mcp server stop (spawned dist)', () => {
  const { spawn } = childProcess;
  const fs = fsPromise;
  const os = osPromise;
  const path = pathPromise;
  const launchPath = path.resolve('dist/launch.cjs');
  const hasDist = fs.existsSync(launchPath);

  const cond = (name, fn) => (hasDist ? test(name, fn, 60000) : test.skip(name, fn));

  /**
   * Spawns `dist/launch.cjs mcp server start --transport http` on `port`
   * with a per-cell temp config dir (the lockfile lives at
   * $FRODO_CONFIG_PATH/mcp-http-<port>.pid) and resolves once the listening
   * line confirms the resolved port. Returns the child plus a cleanup
   * function every caller must run in finally.
   */
  async function spawnServer(port, configDir, extraArgs = []) {
    const profilesPath = path.join(configDir, 'Connections.json');
    fs.writeFileSync(profilesPath, JSON.stringify({}));
    const child = spawn(
      process.execPath,
      [
        launchPath,
        'mcp', 'server', 'start',
        '--transport', 'http',
        '--port', String(port),
        ...extraArgs,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FRODO_TEST: '1',
          NO_COLOR: '1',
          FRODO_CONNECTION_PROFILES_PATH: profilesPath,
          FRODO_CONFIG_PATH: configDir,
        },
      }
    );
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    if (port > 0) {
      await waitForListening('127.0.0.1', port, 30000);
    }
    return { child, stdout, stderr, getStdout: () => stdout, getStderr: () => stderr };
  }

  /** The child's combined output so far (printMessage writes to stderr). */
  function allOutput(spawned) {
    return spawned.getStdout() + spawned.getStderr();
  }

  /** Runs a `dist/launch.cjs mcp server stop` invocation to completion. */
  function runStop(port, configDir) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [launchPath, 'mcp', 'server', 'stop', '--port', String(port)],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, FRODO_TEST: '1', NO_COLOR: '1', FRODO_CONFIG_PATH: configDir },
        }
      );
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk.toString('utf8');
      });
      let err = '';
      child.stderr.on('data', (chunk) => {
        err += chunk.toString('utf8');
      });
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`stop on port ${port} timed out`));
      }, 30000);
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, output: out + err });
      });
    });
  }

  /** Polls until the port refuses connections (server gone) or deadline. */
  async function waitForPortClosed(port, deadlineMs = 15000) {
    const started = Date.now();
    const tryClose = () =>
      new Promise((resolve) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => {
          socket.destroy();
          resolve(false);
        });
        socket.once('error', () => resolve(true));
      });
    while (Date.now() < started + deadlineMs) {
      if (await tryClose()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`port ${port} is still accepting connections`);
  }

  /**
   * Reap-then-cleanup for the spawned server: a stop that succeeded already
   * ended the process, so kill() here only matters on failure paths.
   */
  function killChild(child) {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }

  cond('stop happy path: exit 0, lockfile gone, port rebindable, process gone', async () => {
    const port = await getFreePort();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-stop-'));
    let server;
    try {
      const spawned = await spawnServer(port, tmpDir);
      server = spawned.child;
      const lockPath = path.join(tmpDir, `mcp-http-${port}.pid`);
      expect(fs.existsSync(lockPath)).toBe(true);

      const stop = await runStop(port, tmpDir);
      expect(stop.code).toBe(0);
      expect(stop.output).toContain(`port ${port} released`);
      // Lockfile gone after the confirmed death.
      expect(fs.existsSync(lockPath)).toBe(false);
      // Port actually released: a fresh bind must succeed.
      await waitForPortClosed(port);
      const rebind = await new Promise((resolve, reject) => {
        const s = http.createServer();
        s.on('error', reject);
        s.listen(port, '127.0.0.1', () => s.close(() => resolve(true)));
      });
      expect(rebind).toBe(true);
      // The signaled process exits (its graceful shutdown runs).
      await new Promise((resolve) => {
        if (server.exitCode !== null || server.signalCode !== null) {
          resolve();
        } else {
          server.once('exit', resolve);
        }
      });
    } finally {
      killChild(server);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  cond('stop with no lockfile: exit 1 with the helpful message', async () => {
    const port = await getFreePort();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-stop-no-'));
    try {
      const stop = await runStop(port, tmpDir);
      expect(stop.code).toBe(1);
      expect(stop.output).toContain(`No MCP HTTP server lockfile for port ${port}`);
      expect(stop.output).toContain('was it started with --transport http?');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  cond('stop on a stale lockfile (dead PID): exit 0, lockfile removed, stale message', async () => {
    const port = await getFreePort();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-stop-stale-'));
    try {
      const lockPath = path.join(tmpDir, `mcp-http-${port}.pid`);
      // A dead writer: an implausible PID the liveness check cannot find.
      fs.writeFileSync(
        lockPath,
        JSON.stringify({
          pid: 2147483000,
          port,
          bindHost: '127.0.0.1',
          startedAt: '2026-01-01T00:00:00.000Z',
        })
      );
      const stop = await runStop(port, tmpDir);
      expect(stop.code).toBe(0);
      expect(stop.output).toContain('Stale lockfile');
      expect(stop.output).toContain('2147483000');
      expect(stop.output).toContain('Lockfile removed');
      expect(fs.existsSync(lockPath)).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  cond('--port auto: resolved port printed, /health answers, stop on the resolved port exits 0', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-stop-auto-'));
    let server;
    let resolvedPort;
    try {
      const spawned = await spawnServer('auto', tmpDir);
      server = spawned.child;
      // The listening line (printMessage -> stderr) carries the OS-resolved
      // port; the lockfile is keyed on it, which is how stop finds the
      // server.
      const listening = await new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          const match = allOutput(spawned).match(/listening on http:\/\/127\.0\.0\.1:(\d+)\/mcp/);
          if (match) {
            resolve(Number(match[1]));
            return;
          }
          if (Date.now() > started + 30000) {
            reject(new Error(`listening line never appeared; output: ${allOutput(spawned)}`));
            return;
          }
          setTimeout(poll, 50);
        };
        poll();
      });
      resolvedPort = listening;
      expect(resolvedPort).toBeGreaterThan(0);
      expect(resolvedPort).not.toBe(6277);
      // Lockfile keyed on the RESOLVED port (not on 'auto' / 0), and
      // connectable on the printed port.
      expect(
        fs.existsSync(path.join(tmpDir, `mcp-http-${resolvedPort}.pid`))
      ).toBe(true);
      const health = await new Promise((resolve, reject) => {
        const req = httpRequest(
          { host: '127.0.0.1', port: resolvedPort, method: 'GET', path: '/health', timeout: 5000 },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          }
        );
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('health probe timed out'));
        });
        req.on('error', reject);
        req.end();
      });
      expect(health).toBe(200);

      const stop = await runStop(resolvedPort, tmpDir);
      expect(stop.code).toBe(0);
      expect(stop.output).toContain(`port ${resolvedPort} released`);
      expect(
        fs.existsSync(path.join(tmpDir, `mcp-http-${resolvedPort}.pid`))
      ).toBe(false);
    } finally {
      killChild(server);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Bounded request body (frodo transport policy: 413 before buffering and
// mid-stream) and the concurrency cap (429 + Retry-After, queue-less)
// ---------------------------------------------------------------------------

describe('transport limits (body size + concurrency)', () => {
  beforeEach(() => {
    printed.length = 0;
  });

  afterEach(async () => {
    await shutdownTransport();
  });

  // Re-declared here so this suite is self-contained within the file's
  // existing scope (the startHttpTransport describe keeps its own copies).
  let currentDone = null;
  async function shutdownTransport() {
    if (currentDone) {
      const done = currentDone;
      currentDone = null;
      process.emit('SIGTERM', 'SIGTERM');
      await done;
    }
  }

  function startServerWith(port, options) {
    currentDone = startHttpTransport(
      { listTools: () => [] },
      '127.0.0.1',
      port,
      undefined,
      options
    );
    return currentDone;
  }

  /**
   * Connects a raw socket to the test server. Every socket returned here has
   * a noop 'error' handler installed up front: the 413 paths destroy the
   * socket after responding (deliberately RSTing any unread body), and an
   * unhandled 'error' event on a jest worker's socket kills the whole run —
   * exactly the hang this suite once spent an afternoon on.
   */
  async function connectRaw(port) {
    return new Promise((resolve, reject) => {
      const s = net.connect(port, '127.0.0.1');
      s.once('error', () => {
        // Suppress: resolve-time errors are handled per test below; later
        // errors (RST after a 413) are expected and ignorable.
      });
      s.once('connect', () => resolve(s));
      s.once('error', reject);
    });
  }

  test('413 on a Content-Length over the default limit, before any body byte is buffered', async () => {
    const port = await getFreePort();
    startServerWith(port, {});
    await waitForListening('127.0.0.1', port);
    // Declare 1 MiB + 1 bytes: over the default cap, but only ~1.5 MiB is
    // actually sent (smaller than a giant allocation; the pre-check fires on
    // the header, so even a partial send is enough).
    const overLimit = 1024 * 1024 + 1;
    const res = await rawRequest(port, 'POST', '/mcp', {
      ...JSON_HEADERS,
      'content-length': String(overLimit),
    }, 'x'.repeat(64));
    expect(res.status).toBe(413);
    const payload = JSON.parse(res.text);
    expect(payload.error.code).toBe(-32000);
    expect(payload.error.message).toContain('--max-body-size');
    expect(payload.error.message).toContain('FRODO_MCP_MAX_BODY_SIZE');
    expect(payload.error.data.limitBytes).toBe(1024 * 1024);
    expect(payload.error.data.receivedBytes).toBe(overLimit);
  }, 30000);

  test('413 arrives mid-stream while a chunked over-limit body is still being sent', async () => {
    const port = await getFreePort();
    startServerWith(port, { maxBodySizeBytes: 32 });
    await waitForListening('127.0.0.1', port);
    // The strongest form of the mid-stream guarantee: the 413 must come
    // back while the body is STILL ARRIVING — before the sender has finished
    // (the terminal 0-length chunk is deliberately never sent, and the two
    // sent chunks are separated in time so the cap trips between them).
    // (A lying Content-Length combined with chunked framing is rejected by
    // node's HTTP parser itself with a flat 400 — that never reaches frodo's
    // handler; chunked-only is the shape where the accumulation cap is the
    // only guard.)
    const socket = await connectRaw(port);
    let got413 = false;
    socket.on('data', (chunk) => {
      if (chunk.toString('utf8').includes('413')) {
        got413 = true;
      }
    });
    socket.write(
      'POST /mcp HTTP/1.1\r\n' +
        'Host: 127.0.0.1\r\n' +
        'Content-Type: application/json\r\n' +
        'Accept: application/json, text/event-stream\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n'
    );
    // Chunk 1 (40 bytes, over the 32-byte cap by itself).
    const chunk = 'z'.repeat(40);
    socket.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(got413).toBe(true);
    // The socket is destroyed server-side after the 413 (Connection: close).
    socket.destroy();
  }, 30000);

  test('a chunked body without Content-Length is also capped mid-stream', async () => {
    const port = await getFreePort();
    startServerWith(port, { maxBodySizeBytes: 32 });
    await waitForListening('127.0.0.1', port);
    // Write through the raw socket with a Content-Length of 0 and keep the
    // body coming: node:http server treats a Content-Length: 0 POST with
    // extra bytes as a body without a usable declared length, so the
    // accumulation cap is the only guard. (A plain chunked request is
    // achievable the same way.)
    const socket = await connectRaw(port);
    const responseText = await new Promise((resolve) => {
      let text = '';
      socket.on('data', (chunk) => {
        text += chunk.toString('utf8');
        if (text.includes('\r\n\r\n') && (text.includes('413') || text.length > 200)) {
          socket.end();
          resolve(text);
        }
      });
      socket.write(
        'POST /mcp HTTP/1.1\r\n' +
          'Host: 127.0.0.1\r\n' +
          'Content-Type: application/json\r\n' +
          'Accept: application/json, text/event-stream\r\n' +
          'Transfer-Encoding: chunked\r\n' +
          '\r\n'
      );
      // Two 40-byte chunks: 80 total, over the 32-byte cap, no declared length.
      const chunk = 'z'.repeat(40);
      socket.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
      socket.write(`${chunk.length.toString(16)}\r\n${chunk}\r\n`);
    });
    expect(responseText).toContain(' 413 ');
    expect(responseText).toContain('-32000');
    socket.destroy();
  }, 30000);

  test('under-limit request is served normally (default unchanged behavior)', async () => {
    const port = await getFreePort();
    startServerWith(port, {});
    await waitForListening('127.0.0.1', port);
    const res = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody());
    expect(res.status).toBe(200);
    const dataLine = res.text.split('\n').find((l) => l.startsWith('data: '));
    expect(JSON.parse(dataLine.replace(/^data: /, '')).result.serverInfo.name).toBe('frodo-mcp');
  }, 30000);

  test('a configured maxBodySizeBytes overrides the default both ways', async () => {
    // A smaller cap rejects a body the default would accept.
    const smallPort = await getFreePort();
    startServerWith(smallPort, { maxBodySizeBytes: 16 });
    await waitForListening('127.0.0.1', smallPort);
    const rejected = await rawRequest(smallPort, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody());
    expect(rejected.status).toBe(413);
    expect(JSON.parse(rejected.text).error.data.limitBytes).toBe(16);
    await shutdownTransport();

    // A larger cap accepts a body over the default 1 MiB.
    const bigPort = await getFreePort();
    startServerWith(bigPort, { maxBodySizeBytes: 2 * 1024 * 1024 });
    await waitForListening('127.0.0.1', bigPort);
    const big = legacyInitializeBody();
    const ok = await rawRequest(bigPort, 'POST', '/mcp', JSON_HEADERS, big);
    expect(ok.status).toBe(200);
  }, 30000);

  test('429 with Retry-After when the concurrency cap is saturated; under-cap requests unaffected', async () => {
    const port = await getFreePort();
    startServerWith(port, { maxConcurrentRequests: 1 });
    await waitForListening('127.0.0.1', port);

    // The first request must HOLD the only slot while the second one runs,
    // so it cannot go through rawRequest (an initialize's SSE handler
    // finishes on its own once the response is written, and rawRequest also
    // destroys the socket). A request whose body is only PARTIALLY sent
    // keeps its handler awaiting readJsonBody — the slot is genuinely in
    // flight. The second request then arrives while the first is stalled.
    const stalled = await connectRaw(port);
    // Declare 200 bytes, send only half: the handler awaits the rest.
    stalled.write(
      `POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: 200\r\n\r\n${'a'.repeat(100)}`
    );
    await new Promise((resolve) => setTimeout(resolve, 200));

    // While that slot is held, the next request must bounce 429.
    const second = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody());
    expect(second.status).toBe(429);
    expect(second.headers['retry-after']).toBe('1');
    const payload = JSON.parse(second.text);
    expect(payload.error.code).toBe(-32000);
    expect(payload.error.message).toContain('Server busy');
    expect(payload.error.data.maxConcurrentRequests).toBe(1);

    // Release the slot (complete the stalled body), then the next request
    // is served: the cap counts in-flight executions, not cumulative
    // traffic.
    stalled.end('a'.repeat(100));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const third = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody());
    expect(third.status).toBe(200);
    stalled.destroy();
  }, 30000);

  test('health probes and non-POST routes never take a concurrency slot', async () => {
    const port = await getFreePort();
    startServerWith(port, { maxConcurrentRequests: 1 });
    await waitForListening('127.0.0.1', port);
    // Hold the only slot with a partially-sent body (see the 429 cell).
    const stalled = await connectRaw(port);
    stalled.write(
      `POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: 200\r\n\r\n${'a'.repeat(100)}`
    );
    await new Promise((resolve) => setTimeout(resolve, 200));
    // /health and 404s answer while the only slot is held.
    const health = await rawRequest(port, 'GET', '/health');
    expect(health.status).toBe(200);
    const notFound = await rawRequest(port, 'GET', '/other');
    expect(notFound.status).toBe(404);
    stalled.destroy();
  }, 30000);

  test('the 429 counts handler executions and the slot frees after the response completes', async () => {
    // Non-SSE rejection paths (metadata gate) also hold + release slots.
    const port = await getFreePort();
    startServerWith(port, { maxConcurrentRequests: 1 });
    await waitForListening('127.0.0.1', port);
    // An empty batch is rejected 400 without touching the transport: the
    // slot must be released by the time the next request runs.
    const batch = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, '[]');
    expect(batch.status).toBe(400);
    const next = await rawRequest(port, 'POST', '/mcp', JSON_HEADERS, legacyInitializeBody());
    expect(next.status).toBe(200);
  }, 30000);
});

// ---------------------------------------------------------------------------
// Transport-limit option resolution (server-limits.ts: flag-over-env,
// invalid-means-default)
// ---------------------------------------------------------------------------

describe('transport limit resolution (server-limits)', () => {
  const BODY_ENV = 'FRODO_MCP_MAX_BODY_SIZE';
  const CONCURRENCY_ENV = 'FRODO_MCP_MAX_CONCURRENT_REQUESTS';
  let savedBody;
  let savedConcurrency;
  let resolveMcpHttpMaxBodySize;
  let resolveMcpHttpMaxConcurrentRequests;
  let parsePositiveIntOptionValue;

  beforeAll(async () => {
    ({ resolveMcpHttpMaxBodySize, resolveMcpHttpMaxConcurrentRequests, parsePositiveIntOptionValue } = await import(
      '../../src/cli/mcp/server/server-limits.ts'
    ));
  });

  beforeEach(() => {
    savedBody = process.env[BODY_ENV];
    savedConcurrency = process.env[CONCURRENCY_ENV];
    delete process.env[BODY_ENV];
    delete process.env[CONCURRENCY_ENV];
  });

  afterEach(() => {
    if (savedBody === undefined) {
      delete process.env[BODY_ENV];
    } else {
      process.env[BODY_ENV] = savedBody;
    }
    if (savedConcurrency === undefined) {
      delete process.env[CONCURRENCY_ENV];
    } else {
      process.env[CONCURRENCY_ENV] = savedConcurrency;
    }
  });

  test('defaults apply when neither flag nor env is set', () => {
    expect(resolveMcpHttpMaxBodySize(undefined, undefined)).toBe(1024 * 1024);
    expect(resolveMcpHttpMaxConcurrentRequests(undefined, undefined)).toBe(64);
  });

  test('flag wins over env, matching the auth-token precedence rule', () => {
    expect(resolveMcpHttpMaxBodySize('4096', '8192')).toBe(4096);
    expect(resolveMcpHttpMaxConcurrentRequests('8', '16')).toBe(8);
  });

  test('env applies when no flag is set', () => {
    expect(resolveMcpHttpMaxBodySize(undefined, '8192')).toBe(8192);
    expect(resolveMcpHttpMaxConcurrentRequests(undefined, '16')).toBe(16);
  });

  test.each([
    ['0'],
    ['-1'],
    ['abc'],
    ['12.5'],
    [''],
    ['Infinity'],
    ['NaN'],
  ])('invalid value %p falls back to the default and reports the ignored channel', (bad) => {
    // A zero/negative/garbage limit must never disable the cap entirely.
    const invalids = [];
    const bodySize = resolveMcpHttpMaxBodySize(bad, undefined, (invalid) => invalids.push(invalid));
    expect(bodySize).toBe(1024 * 1024);
    expect(invalids).toEqual([{ flag: bad, env: undefined }]);
    // Same via the env channel.
    const invalidsEnv = [];
    expect(resolveMcpHttpMaxConcurrentRequests(undefined, bad, (invalid) => invalidsEnv.push(invalid))).toBe(64);
    expect(invalidsEnv).toEqual([{ flag: undefined, env: bad }]);
  });

  test('an invalid flag does not shadow a valid env value', () => {
    expect(resolveMcpHttpMaxBodySize('abc', '4096')).toBe(4096);
    expect(resolveMcpHttpMaxConcurrentRequests('abc', '8')).toBe(8);
  });

  test('parsePositiveIntOptionValue rejects zero/negative/non-integer input', () => {
    expect(parsePositiveIntOptionValue('100')).toBe(100);
    expect(parsePositiveIntOptionValue('0')).toBeUndefined();
    expect(parsePositiveIntOptionValue('-5')).toBeUndefined();
    expect(parsePositiveIntOptionValue('3.14')).toBeUndefined();
    expect(parsePositiveIntOptionValue(undefined)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// PID lockfile, resolved-port printing, --port auto, heartbeat env override
// ---------------------------------------------------------------------------

describe('HTTP transport lockfile + resolved port', () => {
  const fs = fsPromise;
  const os = osPromise;
  const path = pathPromise;
  let tmpConfigDir;
  let savedConfigPath;
  let savedHeartbeatEnv;

  beforeEach(() => {
    printed.length = 0;
    tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-lockfile-'));
    savedConfigPath = process.env.FRODO_CONFIG_PATH;
    process.env.FRODO_CONFIG_PATH = tmpConfigDir;
    savedHeartbeatEnv = process.env.FRODO_MCP_HEARTBEAT_INTERVAL_MS;
    delete process.env.FRODO_MCP_HEARTBEAT_INTERVAL_MS;
  });

  afterEach(async () => {
    await shutdownTransport();
    if (savedConfigPath === undefined) {
      delete process.env.FRODO_CONFIG_PATH;
    } else {
      process.env.FRODO_CONFIG_PATH = savedConfigPath;
    }
    if (savedHeartbeatEnv === undefined) {
      delete process.env.FRODO_MCP_HEARTBEAT_INTERVAL_MS;
    } else {
      process.env.FRODO_MCP_HEARTBEAT_INTERVAL_MS = savedHeartbeatEnv;
    }
    fs.rmSync(tmpConfigDir, { recursive: true, force: true });
  });

  let currentDone = null;
  async function shutdownTransport() {
    if (currentDone) {
      const done = currentDone;
      currentDone = null;
      process.emit('SIGTERM', 'SIGTERM');
      await done;
    }
  }

  function startServerOn(port, options) {
    currentDone = startHttpTransport(
      { listTools: () => [] },
      '127.0.0.1',
      port,
      undefined,
      options
    );
    return currentDone;
  }

  test('writes the lockfile on listen with the record shape, removes it on shutdown', async () => {
    const port = await getFreePort();
    startServerOn(port, {});
    await waitForListening('127.0.0.1', port);
    const lockPath = path.join(tmpConfigDir, `mcp-http-${port}.pid`);
    expect(fs.existsSync(lockPath)).toBe(true);
    const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(record.pid).toBe(process.pid);
    expect(record.port).toBe(port);
    expect(record.bindHost).toBe('127.0.0.1');
    expect(record.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Shutdown (SIGTERM — one of the four signals; the other three share the
    // same shutdown closure) removes it.
    await shutdownTransport();
    expect(fs.existsSync(lockPath)).toBe(false);
  }, 30000);

  test('a start over a dead-PID lockfile warns stale, serves, and rewrites the record with a live PID', async () => {
    // The scenario: a previous server crashed without the best-effort
    // lockfile removal (kill -9, reboot) and left its record behind. The new
    // start must not be blocked by it — but it must say so, and the rewritten
    // lockfile must name the NEW process, or `frodo mcp server stop` would
    // SIGTERM a ghost. (A live-PID lockfile instead leads to EADDRINUSE —
    // covered implicitly by the EADDRINUSE cells — so only the dead-PID path
    // is reachable in-process.)
    const port = await getFreePort();
    const lockPath = path.join(tmpConfigDir, `mcp-http-${port}.pid`);
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 2147483000, // implausible PID: liveness check fails
        port,
        bindHost: '127.0.0.1',
        startedAt: '2026-01-01T00:00:00.000Z',
      })
    );
    printed.length = 0;
    startServerOn(port, {});
    await waitForListening('127.0.0.1', port);
    try {
      // One warn line naming the port and the dead PID.
      const staleNotes = printed.filter((p) =>
        p.msg.includes('stale lockfile for port')
      );
      expect(staleNotes).toHaveLength(1);
      expect(staleNotes[0].type).toBe('warn');
      expect(staleNotes[0].msg).toContain(String(port));
      expect(staleNotes[0].msg).toContain('2147483000');
      // The server is actually up (waitForListening already connected, and a
      // health probe doubles as the sanity check).
      const health = await rawRequest(port, 'GET', '/health');
      expect(health.status).toBe(200);
      // The lockfile was rewritten with the live writer's PID.
      const record = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      expect(record.pid).toBe(process.pid);
    } finally {
      await shutdownTransport();
    }
    expect(fs.existsSync(lockPath)).toBe(false);
  }, 30000);

  test('the listening line prints the OS-resolved port for --port 0, and the lockfile uses it', async () => {
    // The known wrong-print: requesting port 0 (or --port auto) used to echo
    // the REQUESTED port (0) in the listening line; the line must carry the
    // port the OS actually assigned, and the lockfile must be keyed on it.
    printed.length = 0;
    startServerOn(0, {});
    await new Promise((resolve) => setTimeout(resolve, 300));
    const listening = printed.find((p) => p.msg.includes('listening on'));
    expect(listening).toBeDefined();
    const match = listening.msg.match(/http:\/\/127\.0\.0\.1:(\d+)\/mcp/);
    expect(match).not.toBeNull();
    const resolvedPort = Number(match[1]);
    expect(resolvedPort).toBeGreaterThan(0);
    // Connectable on the printed (resolved) port.
    await waitForListening('127.0.0.1', resolvedPort);
    // Lockfile keyed on the resolved port, not on 0.
    expect(fs.existsSync(path.join(tmpConfigDir, 'mcp-http-0.pid'))).toBe(false);
    expect(fs.existsSync(path.join(tmpConfigDir, `mcp-http-${resolvedPort}.pid`))).toBe(true);
  }, 30000);

  test('FRODO_MCP_HEARTBEAT_INTERVAL_MS overrides the interval (clamped to >= 1000ms)', async () => {
    const port = await getFreePort();
    printed.length = 0;
    // env=50 clamps to the 1s floor: the first beat must fire at ~1000ms —
    // well before the 15-minute default ever could, which is exactly what
    // the override is for (operator-verifiable liveness cadence).
    process.env.FRODO_MCP_HEARTBEAT_INTERVAL_MS = '50';
    startServerOn(port, {});
    await waitForListening('127.0.0.1', port);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const beats = printed.filter((p) => p.msg.includes('still listening'));
      expect(beats.length).toBeGreaterThanOrEqual(1);
    } finally {
      await shutdownTransport();
    }
  }, 30000);

  test('an invalid FRODO_MCP_HEARTBEAT_INTERVAL_MS falls back to the 15-minute default (no rapid beats)', async () => {
    const port = await getFreePort();
    printed.length = 0;
    process.env.FRODO_MCP_HEARTBEAT_INTERVAL_MS = 'garbage';
    startServerOn(port, {});
    await waitForListening('127.0.0.1', port);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      // With the 15-minute default, no beat can have fired in 250ms.
      expect(printed.filter((p) => p.msg.includes('still listening'))).toHaveLength(0);
    } finally {
      await shutdownTransport();
    }
  }, 30000);
});

// ---------------------------------------------------------------------------
// Lockfile + identity helpers (McpServerLockfile.ts, dependency-free)
// ---------------------------------------------------------------------------

describe('McpServerLockfile helpers', () => {
  const fs = fsPromise;
  const os = osPromise;
  const path = pathPromise;
  let tmpConfigDir;
  let savedConfigPath;
  let lock;

  beforeAll(async () => {
    lock = await import('../../src/ops/McpServerLockfile.ts');
  });

  beforeEach(() => {
    tmpConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-lock-'));
    savedConfigPath = process.env.FRODO_CONFIG_PATH;
    process.env.FRODO_CONFIG_PATH = tmpConfigDir;
  });

  afterEach(() => {
    if (savedConfigPath === undefined) {
      delete process.env.FRODO_CONFIG_PATH;
    } else {
      process.env.FRODO_CONFIG_PATH = savedConfigPath;
    }
    fs.rmSync(tmpConfigDir, { recursive: true, force: true });
  });

  test('write/read round-trips the record and honors FRODO_CONFIG_PATH', () => {
    const ok = lock.writeMcpHttpLockfile({
      pid: 4242,
      port: 6277,
      bindHost: '127.0.0.1',
      startedAt: '2026-09-02T00:00:00.000Z',
    });
    expect(ok).toBe(true);
    expect(lock.getMcpHttpLockfilePath(6277)).toBe(
      path.join(tmpConfigDir, 'mcp-http-6277.pid')
    );
    expect(lock.readMcpHttpLockfile(6277)).toEqual({
      pid: 4242,
      port: 6277,
      bindHost: '127.0.0.1',
      startedAt: '2026-09-02T00:00:00.000Z',
    });
  });

  test('a missing or malformed lockfile reads as null, never throws', () => {
    expect(lock.readMcpHttpLockfile(9999)).toBeNull();
    fs.writeFileSync(path.join(tmpConfigDir, 'mcp-http-9998.pid'), 'not json{');
    expect(lock.readMcpHttpLockfile(9998)).toBeNull();
    fs.writeFileSync(path.join(tmpConfigDir, 'mcp-http-9997.pid'), '{"port":1}');
    expect(lock.readMcpHttpLockfile(9997)).toBeNull();
  });

  test('isPidAlive is true for our own pid and false for an implausible one', () => {
    expect(lock.isPidAlive(process.pid)).toBe(true);
    expect(lock.isPidAlive(2147483000)).toBe(false);
  });

  test('removeMcpHttpLockfile is a safe no-op for a missing file', () => {
    expect(() => lock.removeMcpHttpLockfile(12345)).not.toThrow();
  });

  test('verifyMcpProcessIdentity classifies a frodo child as frodo (PID-reuse guard)', async () => {
    // A real node process running our own module: its argv contains node and
    // a jest path — NOT a frodo entrypoint, so the guard must flag it as
    // "not frodo" on Linux (/proc) or via ps on macOS.
    const { spawn } = childProcess;
    const sleeper = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      stdio: 'ignore',
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      const identity = lock.verifyMcpProcessIdentity(sleeper.pid);
      expect(identity.verified).toBe(true);
      expect(identity.looksLikeFrodo).toBe(false);
    } finally {
      sleeper.kill('SIGKILL');
    }
  });
});

describe('port option resolution (parseMcpHttpPortOption)', () => {
  let parseMcpHttpPortOption;

  beforeAll(async () => {
    ({ parseMcpHttpPortOption } = await import(
      '../../src/cli/mcp/server/server-limits.ts'
    ));
  });

  test("resolves 'auto' (any case) to 0 for an OS-assigned port", () => {
    expect(parseMcpHttpPortOption('auto')).toBe(0);
    expect(parseMcpHttpPortOption('AUTO')).toBe(0);
    expect(parseMcpHttpPortOption('Auto')).toBe(0);
  });

  test('passes through valid ports and falls back to 6277 otherwise', () => {
    expect(parseMcpHttpPortOption('8443')).toBe(8443);
    expect(parseMcpHttpPortOption('6277')).toBe(6277);
    expect(parseMcpHttpPortOption(undefined)).toBe(6277);
    expect(parseMcpHttpPortOption('')).toBe(6277);
    expect(parseMcpHttpPortOption('0')).toBe(6277);
    expect(parseMcpHttpPortOption('-1')).toBe(6277);
    expect(parseMcpHttpPortOption('70000')).toBe(6277);
    expect(parseMcpHttpPortOption('abc')).toBe(6277);
  });
});

describe('heartbeat interval resolution (resolveMcpHttpHeartbeatInterval)', () => {
  let resolveMcpHttpHeartbeatInterval;

  beforeAll(async () => {
    ({ resolveMcpHttpHeartbeatInterval } = await import(
      '../../src/ops/McpServerOps.ts'
    ));
  });

  test('option wins over env; invalid env falls back to the 15-minute default', () => {
    const FIFTEEN_MIN = 15 * 60 * 1000;
    expect(resolveMcpHttpHeartbeatInterval(undefined, undefined)).toBe(FIFTEEN_MIN);
    // The injectable option is NOT clamped: tests drive the real-timer
    // lifecycle cells with sub-second periods (the 1s floor applies to the
    // env value only — an operator-visible knob, not a test hook).
    expect(resolveMcpHttpHeartbeatInterval(40, undefined)).toBe(40);
    expect(resolveMcpHttpHeartbeatInterval(5000, '123')).toBe(5000); // option wins
    expect(resolveMcpHttpHeartbeatInterval(undefined, '5000')).toBe(5000);
    expect(resolveMcpHttpHeartbeatInterval(undefined, '50')).toBe(1000); // clamped
    expect(resolveMcpHttpHeartbeatInterval(undefined, '0')).toBe(FIFTEEN_MIN);
    expect(resolveMcpHttpHeartbeatInterval(undefined, 'abc')).toBe(FIFTEEN_MIN);
    expect(resolveMcpHttpHeartbeatInterval(undefined, '')).toBe(FIFTEEN_MIN);
  });
});

describe('OAuth resource-server mode ("shared mode")', () => {
  const amBaseUrl = 'https://openam-example.forgeblocks.com/am';

  afterEach(() => {
    mockStateHost = undefined;
    mockStateDeploymentType = undefined;
  });

  describe('buildAmOAuthMetadata', () => {
    test('builds RFC 8414 metadata from the tenant\'s known endpoint scheme', () => {
      const metadata = buildAmOAuthMetadata(amBaseUrl);

      expect(metadata.issuer).toBe(`${amBaseUrl}/oauth2`);
      expect(metadata.authorization_endpoint).toBe(`${amBaseUrl}/oauth2/authorize`);
      expect(metadata.token_endpoint).toBe(`${amBaseUrl}/oauth2/access_token`);
      expect(metadata.jwks_uri).toBe(`${amBaseUrl}/oauth2/connect/jwk_uri`);
      expect(metadata.response_types_supported).toEqual(['code']);
    });
  });

  describe('buildAmTokenInfoVerifier', () => {
    test('maps a valid tokeninfo response to AuthInfo', async () => {
      mockGetTokenInfo = async (calledAmBaseUrl, config) => {
        expect(calledAmBaseUrl).toBe(amBaseUrl);
        expect(config.headers.Authorization).toBe('Bearer real-token');
        return {
          sub: 'jdoe',
          aud: 'some-mcp-client',
          scope: ['fr:idm:*'],
          exp: 1893456000,
          realm: '/',
          tokenName: 'access_token',
        };
      };

      const verifier = buildAmTokenInfoVerifier(amBaseUrl);
      const authInfo = await verifier.verifyAccessToken('real-token');

      expect(authInfo).toEqual({
        token: 'real-token',
        clientId: 'some-mcp-client',
        scopes: ['fr:idm:*'],
        expiresAt: 1893456000,
        extra: {
          sub: 'jdoe',
          realm: '/',
          tokenName: 'access_token',
          sessionToken: undefined,
        },
      });
    });

    test('throws an OAuthError(invalid_token) when the tenant rejects the token', async () => {
      mockGetTokenInfo = async () => {
        throw new Error('401 from AM');
      };

      const verifier = buildAmTokenInfoVerifier(amBaseUrl);

      await expect(verifier.verifyAccessToken('bad-token')).rejects.toMatchObject({
        code: 'invalid_token',
      });
    });
  });

  describe('verifyMcpOAuthBearerToken', () => {
    test('returns AuthInfo for a valid Authorization header', async () => {
      mockGetTokenInfo = async () => ({
        sub: 'jdoe',
        aud: 'client',
        scope: ['fr:idm:*'],
        exp: 1893456000,
        realm: '/',
      });

      const authInfo = await verifyMcpOAuthBearerToken('Bearer real-token', {
        verifier: buildAmTokenInfoVerifier(amBaseUrl),
        oauthMetadata: buildAmOAuthMetadata(amBaseUrl),
        resourceServerUrl: new URL('http://127.0.0.1:6277/mcp'),
      });

      expect(authInfo.token).toBe('real-token');
      expect(authInfo.scopes).toEqual(['fr:idm:*']);
    });

    test('rejects a missing Authorization header', async () => {
      await expect(
        verifyMcpOAuthBearerToken(undefined, {
          verifier: buildAmTokenInfoVerifier(amBaseUrl),
          oauthMetadata: buildAmOAuthMetadata(amBaseUrl),
          resourceServerUrl: new URL('http://127.0.0.1:6277/mcp'),
        })
      ).rejects.toMatchObject({ code: 'invalid_token' });
    });
  });

  describe('buildRequestContext bearer-token branch', () => {
    test('an authInfo argument wins outright, building a bearer-token auth context', () => {
      mockStateHost = amBaseUrl;
      mockStateDeploymentType = 'cloud';

      const context = buildRequestContext(undefined, undefined, {
        token: 'caller-token',
        clientId: 'client',
        scopes: ['fr:idm:*'],
        expiresAt: 1893456000,
        extra: { sessionToken: 'am-session-id' },
      });

      expect(context.auth).toEqual({
        mode: 'bearer-token',
        host: amBaseUrl,
        accessToken: 'caller-token',
        scope: 'fr:idm:*',
        expiresAt: 1893456000 * 1000,
        sessionId: 'am-session-id',
        realm: undefined,
        deploymentType: 'cloud',
        allowInsecureConnection: false,
        debug: false,
        curlirize: false,
      });
    });

    test('with no authInfo, falls back to the existing ambient-state resolution (state-config)', () => {
      mockStateHost = undefined;

      const context = buildRequestContext();

      expect(context.auth.mode).toBe('state-config');
    });

    test('a resolved claim-mapped service account wins over the bearer-token branch', () => {
      mockStateHost = 'https://openam-example.forgeblocks.com/am';
      mockStateDeploymentType = 'cloud';

      const context = buildRequestContext(undefined, undefined, {
        token: 'external-idp-token',
        clientId: 'external-client',
        scopes: [],
        extra: {
          resolvedServiceAccountId: 'sa-id-1',
          resolvedServiceAccountJwk: { kty: 'RSA', kid: 'k1' },
        },
      });

      expect(context.auth).toEqual({
        mode: 'service-account',
        host: 'https://openam-example.forgeblocks.com/am',
        serviceAccountId: 'sa-id-1',
        serviceAccountJwk: JSON.stringify({ kty: 'RSA', kid: 'k1' }),
        realm: undefined,
        deploymentType: 'cloud',
        allowInsecureConnection: false,
        debug: false,
        curlirize: false,
      });
    });
  });

  describe('buildExternalIdpVerifier (external-IDP "shared mode")', () => {
    const oauthMetadata = {
      issuer: 'https://login.example.com/tenant/v2.0',
      authorization_endpoint: 'https://login.example.com/tenant/v2.0/authorize',
      token_endpoint: 'https://login.example.com/tenant/v2.0/token',
      response_types_supported: ['code'],
    };
    const jwks = { keys: [] };

    afterEach(() => {
      mockVerifyJwtAgainstJwks = async () => {
        throw new Error('verifyJwtAgainstJwks mock not configured');
      };
    });

    test('maps verified claims to AuthInfo when issuer/audience/expiry all check out', async () => {
      const claims = {
        iss: oauthMetadata.issuer,
        aud: 'test-audience',
        azp: 'test-audience',
        scope: 'openid profile',
        exp: Math.floor(Date.now() / 1000 + 300),
        groups: ['frodo-mcp-admins'],
      };
      mockVerifyJwtAgainstJwks = async () => claims;

      const verifier = buildExternalIdpVerifier(oauthMetadata, jwks, 'test-audience');
      const authInfo = await verifier.verifyAccessToken('some-jwt');

      expect(authInfo.token).toBe('some-jwt');
      expect(authInfo.clientId).toBe('test-audience');
      expect(authInfo.scopes).toEqual(['openid', 'profile']);
      expect(authInfo.expiresAt).toBe(claims.exp);
      expect(authInfo.extra).toEqual(claims);
    });

    test('rejects a token whose issuer does not match', async () => {
      mockVerifyJwtAgainstJwks = async () => ({
        iss: 'https://not-the-right-issuer.example.com',
        aud: 'test-audience',
        exp: Math.floor(Date.now() / 1000 + 300),
      });

      const verifier = buildExternalIdpVerifier(oauthMetadata, jwks, 'test-audience');

      await expect(verifier.verifyAccessToken('some-jwt')).rejects.toMatchObject(
        { code: 'invalid_token' }
      );
    });

    test('rejects a token whose audience does not match', async () => {
      mockVerifyJwtAgainstJwks = async () => ({
        iss: oauthMetadata.issuer,
        aud: 'someone-elses-client',
        exp: Math.floor(Date.now() / 1000 + 300),
      });

      const verifier = buildExternalIdpVerifier(oauthMetadata, jwks, 'test-audience');

      await expect(verifier.verifyAccessToken('some-jwt')).rejects.toMatchObject(
        { code: 'invalid_token' }
      );
    });

    test('rejects an expired token', async () => {
      mockVerifyJwtAgainstJwks = async () => ({
        iss: oauthMetadata.issuer,
        aud: 'test-audience',
        exp: Math.floor(Date.now() / 1000 - 60),
      });

      const verifier = buildExternalIdpVerifier(oauthMetadata, jwks, 'test-audience');

      await expect(verifier.verifyAccessToken('some-jwt')).rejects.toMatchObject(
        { code: 'invalid_token' }
      );
    });

    test('rejects a token that fails signature verification', async () => {
      mockVerifyJwtAgainstJwks = async () => {
        throw new Error('no key found');
      };

      const verifier = buildExternalIdpVerifier(oauthMetadata, jwks, 'test-audience');

      await expect(verifier.verifyAccessToken('some-jwt')).rejects.toMatchObject(
        { code: 'invalid_token' }
      );
    });
  });

  describe('buildClaimMappedCredentialResolver (external-IDP claim-to-credential mapping)', () => {
    const claimMapping = {
      claimName: 'groups',
      mappings: [
        { claimValue: 'frodo-mcp-admins', serviceAccount: 'admin-sa' },
      ],
    };

    afterEach(() => {
      mockGetAdditionalServiceAccount = async () => {
        throw new Error('getAdditionalServiceAccount mock not configured');
      };
    });

    test('resolves a matched claim to the named additional service account', async () => {
      mockGetAdditionalServiceAccount = async (host, name) => {
        expect(host).toBe('https://openam-example.forgeblocks.com/am');
        expect(name).toBe('admin-sa');
        return {
          name: 'admin-sa',
          svcacctId: 'sa-id-1',
          svcacctJwk: { kty: 'RSA', kid: 'k1' },
          svcacctScope: 'fr:idm:*',
        };
      };
      const resolver = buildClaimMappedCredentialResolver(
        claimMapping,
        'https://openam-example.forgeblocks.com/am'
      );

      const resolved = await resolver({
        token: 'x',
        clientId: 'c',
        scopes: [],
        extra: { groups: ['frodo-mcp-admins'] },
      });

      expect(resolved.extra.resolvedServiceAccountId).toBe('sa-id-1');
      expect(resolved.extra.resolvedServiceAccountJwk).toEqual({
        kty: 'RSA',
        kid: 'k1',
      });
      // Original claims are preserved alongside the resolved credential.
      expect(resolved.extra.groups).toEqual(['frodo-mcp-admins']);
    });

    test('fails closed (InsufficientScope) when nothing matches — never a default credential', async () => {
      const resolver = buildClaimMappedCredentialResolver(
        claimMapping,
        'https://openam-example.forgeblocks.com/am'
      );

      await expect(
        resolver({
          token: 'x',
          clientId: 'c',
          scopes: [],
          extra: { groups: ['unmapped-group'] },
        })
      ).rejects.toMatchObject({ code: 'insufficient_scope' });
    });
  });
});
