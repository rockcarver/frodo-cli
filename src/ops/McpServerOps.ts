/**
 * MCP transport wiring for `frodo mcp server start`.
 *
 * This module is transport-specific: it bridges the transport-agnostic
 * {@link McpService} from frodo-lib with the MCP v2 server and node
 * transport packages.
 *
 * stdio transport  — single-session, process lifetime, reads JSON-RPC from
 *                    stdin and writes responses to stdout.
 *
 * HTTP transport   — stateless StreamableHTTP endpoint at POST /mcp.
 *                    A single transport instance is reused per process.
 *                    Host and origin are validated for localhost safety.
 *
 * @remarks
 * Both transports derive request-scoped auth context from the active shared
 * state configured by `handleDefaultArgsAndOpts` before startup. Generic tool
 * calls may additionally override realm per request.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  request as httpRequest,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { isIP } from 'node:net';

import {
  hostHeaderValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
  toWebRequest,
} from '@modelcontextprotocol/node';
import {
  type AuthInfo,
  bearerAuthChallengeResponse,
  getOAuthProtectedResourceMetadataUrl,
  localhostAllowedHostnames,
  McpServer,
  type OAuthMetadata,
  OAuthError,
  OAuthErrorCode,
  oauthMetadataResponse,
  type OAuthTokenVerifier,
  PROTOCOL_VERSION_META_KEY,
  ToolAnnotations,
  UnsupportedProtocolVersionError,
  verifyBearerToken,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import {
  frodo,
  getRealmFromContext,
  type McpRuntimeRequestContext,
  type McpService,
  type McpToolRuntimeTraceHandler,
  resolveRequestScopedFrodo,
  state,
} from '@rockcarver/frodo-lib';
import { z } from 'zod';

import { printMessage } from '../utils/Console.js';
import { getUseDeviceFlow } from './AuthenticateOps.js';
import {
  type McpClaimMappingConfig,
  resolveServiceAccountForClaims,
} from './McpClaimMapping.js';
import { McpLogger, type McpProtocolLogLevel } from './McpLogger.js';
import {
  getMcpHttpLockfilePath,
  isPidAlive,
  readMcpHttpLockfile,
  removeMcpHttpLockfile,
  writeMcpHttpLockfile,
} from './McpServerLockfile.js';
import {
  MCP_SERVER_DISCOVERY_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
} from './McpServerMetadata.js';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

// Era gate: modern (2026-07-28) protocol revisions begin here. Revision
// identifiers are ISO dates, so lexicographic comparison orders them
// chronologically (mirrors the SDK's isModernProtocolVersion).
const FIRST_MODERN_PROTOCOL_VERSION = '2026-07-28';

// The methods whose body carries a value the `Mcp-Name` header must mirror,
// and which body field supplies it (SEP-2243 Standard Request Headers,
// `Required For` column — mirrors the SDK's MCP_NAME_HEADER_SOURCE map).
const MCP_NAME_HEADER_SOURCE: Record<string, string> = {
  'tools/call': 'name',
  'prompts/get': 'name',
  'resources/read': 'uri',
};

// Zod v4 schema shapes reused for canonical hybrid and special tools.
const MAX_INLINE_RESULT_BYTES = 256 * 1024;
const MAX_INLINE_DISCOVERY_RESULT_BYTES = 2 * 1024 * 1024;
const DISCOVERY_SHAPE = {
  detail: z
    .enum(['summary', 'catalog'])
    .optional()
    .describe(
      'Discovery detail level. Summary is the default; catalog returns the legacy operation matrix for diagnostics.'
    ),
} as const;
const FIND_SKILLS_SHAPE = {
  query: z
    .string()
    .optional()
    .describe(
      'Concise intent query across skills, operations, parameters, and native managed-object types, for example "count users" or "search alpha_user".'
    ),
  objectFamily: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Optional logical object-family filter resolved against live managed-object types using inflection, normalization, unique prefixes, and conservative typo matching.'
    ),
  domain: z
    .string()
    .optional()
    .describe(
      'Optional capability-domain filter. The logical user.User identity coordinates map to idm.ManagedObject on Cloud/ForgeOps and remain user.User on classic.'
    ),
  objectType: z
    .string()
    .optional()
    .describe(
      'Optional capability object-type filter. Use User with domain user for deployment-aware identity discovery; tenant types such as alpha_user belong in query.'
    ),
  skillIdPrefix: z
    .string()
    .optional()
    .describe('Optional skill id prefix filter.'),
  operationTypes: z
    .array(
      z.enum([
        'create',
        'count',
        'read',
        'update',
        'delete',
        'list',
        'search',
        'export',
        'import',
        'special',
      ])
    )
    .optional()
    .describe('Optional operation-type filter list.'),
  riskClasses: z
    .array(z.enum(['low', 'medium', 'high', 'critical']))
    .optional()
    .describe('Optional risk-class filter list.'),
  kind: z
    .enum(['generic', 'special'])
    .optional()
    .describe('Optional capability-kind filter.'),
  limit: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      'Optional maximum number of returned skills. Prefer 5 for concise agent-readable results.'
    ),
  includeIncompatible: z
    .boolean()
    .optional()
    .describe(
      'Include skills incompatible with the resolved deployment. Defaults to false when deployment is known; use only for diagnostics.'
    ),
  executeRecommended: z
    .boolean()
    .optional()
    .describe(
      'Execute a unique deterministic read-only recommendation and return its result. Defaults to true; set false only for discovery diagnostics.'
    ),
} as const;

const DESCRIBE_SKILL_SHAPE = {
  skillId: z.string().describe('Skill id returned by frodo_find_skills.'),
} as const;

const DISPATCH_SHAPE = {
  skillId: z
    .string()
    .optional()
    .describe('Direct skill id selector (preferred).'),
  operationType: z
    .string()
    .optional()
    .describe('Operation type when selecting by tuple.'),
  domain: z
    .string()
    .optional()
    .describe(
      'Top-level capability domain key (e.g. "authn") when selecting by tuple.'
    ),
  objectType: z
    .string()
    .optional()
    .describe(
      'Object type within the domain (e.g. "Journey") when selecting by tuple.'
    ),
  scope: z
    .string()
    .optional()
    .describe(
      'Optional scope selector for ambiguous tuple selections (for example "single" or "bulk").'
    ),
  realm: z
    .string()
    .optional()
    .describe(
      'Optional realm override for request-scoped execution context (e.g. "/alpha").'
    ),
  pageSize: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Optional page size hint for paginated operations.'),
  pageOffset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Optional page offset hint for paginated operations.'),
  pageToken: z
    .string()
    .optional()
    .describe('Optional page token/cursor hint for paginated operations.'),
  includeTotal: z
    .boolean()
    .optional()
    .describe('Optional request for exact total counts when supported.'),
  semanticTarget: z
    .object({
      family: z.string().trim().min(1),
      realm: z.string().optional(),
    })
    .optional()
    .describe(
      'Logical object-family target resolved against the live tenant catalog. For IDM count skills, omitting realm aggregates every matching realm-qualified type and returns a breakdown.'
    ),
  positionalArgs: z
    .array(z.unknown())
    .optional()
    .describe('Ordered arguments forwarded to the underlying Frodo method.'),
  namedArgs: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Named argument map forwarded as a single object to the Frodo method.'
    ),
} as const;

const SPECIAL_SHAPE = {
  positionalArgs: z
    .array(z.unknown())
    .optional()
    .describe('Ordered arguments forwarded to the underlying Frodo method.'),
  namedArgs: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Named argument map forwarded as a single object to the Frodo method.'
    ),
} as const;

export type McpServerStartupInfo = {
  /** Dedicated logger containing buffered startup records. */
  logger: McpLogger;
};

// How often the long-running HTTP server logs a liveness heartbeat. A silent
// long-lived process is indistinguishable from a hung one in remote logs; the
// heartbeat is the "still alive" counter-evidence. unref()ed so it never
// blocks process exit, and cleared on shutdown.
const MCP_HTTP_HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

// The smallest heartbeat period an operator can configure. A sub-second
// heartbeat is never what an operator wants — at that rate the log is noise,
// and a mistaken value (seconds-vs-milliseconds confusion) would flood
// whatever ships these logs.
const MIN_HEARTBEAT_INTERVAL_MS = 1000;

/**
 * The effective liveness heartbeat interval: the injectable option wins
 * (tests drive real-timer lifecycle cells with sub-second periods), then the
 * `FRODO_MCP_HEARTBEAT_INTERVAL_MS` environment override (the
 * operator-verifiability use case — an env var shows up in the
 * container/service definition, no CLI flag), which is clamped to at least
 * {@linkcode MIN_HEARTBEAT_INTERVAL_MS}; invalid or non-positive values fall
 * back to the 15-minute default. Exported for direct unit coverage of the
 * precedence and clamping rules.
 */
export function resolveMcpHttpHeartbeatInterval(
  optionValueMs?: number,
  envValue?: string
): number {
  if (optionValueMs !== undefined && Number.isFinite(optionValueMs)) {
    return optionValueMs;
  }
  if (envValue !== undefined && envValue !== '') {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(parsed, MIN_HEARTBEAT_INTERVAL_MS);
    }
  }
  return MCP_HTTP_HEARTBEAT_INTERVAL_MS;
}

// Frodo transport policy, not an SDK-parity cell: the largest single request
// body accepted on POST /mcp. Unbounded reads let one malformed or hostile
// client pin server memory (the SDK's own Node adapter relies on the host
// framework for exactly this bound). The default is deliberately generous —
// the largest payloads observed in QA gateway crawls were ~400 KB, so 1 MiB
// is ~2.5x headroom — and raisable per deployment via --max-body-size /
// FRODO_MCP_MAX_BODY_SIZE.
export const DEFAULT_MCP_HTTP_MAX_BODY_SIZE_BYTES = 1024 * 1024;

// Frodo transport policy, not an SDK-parity cell: the maximum number of
// request handler executions in flight at once. Over-limit requests get an
// immediate 429 (queue-less reject — the gateway's retry policy is the queue),
// so a burst cannot pile unbounded work onto one process. The default is far
// above any observed gateway load; raisable via --max-concurrent-requests /
// FRODO_MCP_MAX_CONCURRENT_REQUESTS.
export const DEFAULT_MCP_HTTP_MAX_CONCURRENT_REQUESTS = 64;

// The JSON-RPC error code for frodo's own transport-policy rejections (body
// size, concurrency). Outside the JSON-RPC reserved range (-32768..-32000 is
// "Reserved for implementation-defined server-errors"), which is exactly what
// a transport-level policy rejection is.
const TRANSPORT_LIMIT_ERROR_CODE = -32000 as const;

/**
 * A POST /mcp body that exceeded the configured size limit, either at the
 * `Content-Length` pre-check (nothing was read) or mid-stream (accumulation
 * stopped at the limit). Carrying the observed byte count keeps the 413
 * response concrete without ever echoing body contents.
 */
class McpHttpBodyTooLargeError extends Error {
  /** Bytes seen (mid-stream) or declared (Content-Length), when known. */
  readonly receivedBytes: number | undefined;

  constructor(message: string, receivedBytes?: number) {
    super(message);
    this.name = 'McpHttpBodyTooLargeError';
    this.receivedBytes = receivedBytes;
  }
}

/**
 * Queue-less concurrency limiter for POST /mcp handler executions.
 *
 * `tryAcquire` is synchronous on purpose: the bound is a hard ceiling with an
 * immediate `429` for whoever does not fit (documented transport policy — the
 * client's/gateway's retry policy is the queue, and `Retry-After: 1` tells it
 * when), not a queue that would let a burst pile invisible work onto the
 * process. A slot is held from just before the request body is read until the
 * handler's response is fully written (for a tool call, that includes the SSE
 * stream staying open while the tool executes) — so the cap counts in-flight
 * handler *executions*, not merely held sockets, and a slow stream keeps its
 * slot until its handler resolves.
 */
class McpHttpConcurrencyLimiter {
  private inFlight = 0;

  constructor(readonly max: number) {}

  /**
   * Takes a slot when one is free, returns false when the caller must be
   * rejected with `429`.
   */
  tryAcquire(): boolean {
    if (this.inFlight >= this.max) {
      return false;
    }
    this.inFlight += 1;
    return true;
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  get load(): number {
    return this.inFlight;
  }
}

/**
 * Renders one crash-log line: a timestamp, the event kind, the error's name
 * and message, and the first stack frame (where in frodo it blew up) — the
 * minimum an operator needs before reaching for a debugger.
 */
function describeCrash(kind: string, error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : String(error);
  const frame =
    error instanceof Error
      ? error.stack
          ?.split('\n')
          .map((line) => line.trim())
          .find((line) => line.startsWith('at '))
      : undefined;
  return (
    `${new Date().toISOString()} ${kind}: ${name}: ${message}` +
    (frame ? ` (${frame})` : '')
  );
}

/**
 * Registers the process-level `uncaughtException` crash handler scoped to
 * the MCP server lifetime.
 *
 * Unhandled promise rejections are NOT registered here: FrodoCommand's
 * constructor (src/cli/FrodoCommand.ts) installs a global
 * `unhandledRejection` handler during command-tree assembly — strictly
 * before any transport start path runs — so a `listenerCount === 0` guard
 * for rejections could never pass on a CLI path, and registering
 * unconditionally would stack a second handler behind FrodoCommand's (which
 * logs the rejection and sets `process.exitCode = 1`). Rejections in server
 * mode are therefore owned by FrodoCommand's global handler, unchanged: they
 * are logged (the "please report this unhandled error" block) and set exit
 * code 1, while the server keeps serving. This handler covers the event
 * FrodoCommand does not handle: an uncaughtException, which nothing else
 * registers.
 *
 * Registration is guarded by `process.listenerCount('uncaughtException')
 * === 0` so repeated starts (and test workers) never stack handlers.
 *
 * On an uncaughtException: log one crash line, best-effort close the server
 * (`options.beforeExit`), then `process.exit(1)` — an uncaught exception
 * means the process is in an unknown state; a clean exit lets the
 * supervisor (launch wrapper, systemd, container runtime) restart it.
 *
 * Returns a dispose function that removes the handler it registered (a
 * no-op when the guard skipped registration) — for tests.
 */
export function registerServerCrashHandlers(
  startupInfo?: McpServerStartupInfo,
  options?: { beforeExit?: () => void }
): () => void {
  const logCrash = (kind: string, error: unknown): void => {
    const line = describeCrash(kind, error);
    if (startupInfo) {
      startupInfo.logger.error('crash', line);
    } else {
      printMessage(line, 'error');
    }
  };

  const added: Array<['uncaughtException', (arg: unknown) => void]> = [];

  if (!process.listenerCount('uncaughtException')) {
    const onUncaughtException = (error: unknown): void => {
      logCrash('uncaughtException', error);
      try {
        // An uncaughtException can leave the HTTP port bound; best-effort
        // release it before the deliberate exit so a supervisor restart
        // doesn't hit EADDRINUSE against our own corpse.
        options?.beforeExit?.();
      } catch {
        // The exit below must not be held hostage by a failing cleanup.
      }
      process.exit(1);
    };
    process.on('uncaughtException', onUncaughtException);
    added.push(['uncaughtException', onUncaughtException]);
  }

  return () => {
    for (const [name, handler] of added) {
      process.off(name, handler as () => void);
    }
    added.length = 0;
  };
}

// ---------------------------------------------------------------------------
// Server builder
// ---------------------------------------------------------------------------

/**
 * Constructs an `McpServer` with all tools from the service registered.
 *
 * Tools are registered once and the server instance is reused across
 * transport connections (important for the multi-session HTTP transport).
 *
 * @param service Fully composed MCP service from `createMcpService`.
 * @returns Configured `McpServer` ready to connect to a transport.
 */
export function buildMcpServer(
  service: McpService,
  startupInfo?: McpServerStartupInfo
): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
    {
      capabilities: { logging: {}, experimental: { 'claude/channel': {} } },
      instructions: MCP_SERVER_DISCOVERY_INSTRUCTIONS,
      supportedProtocolVersions: MCP_SUPPORTED_PROTOCOL_VERSIONS,
    }
  );

  server.server.oninitialized = () => {
    // `oninitialized` fires only when the client sends `notifications/initialized`,
    // which is a legacy-era-only message. Modern 2026-07-28 clients use the
    // `server/discover` handshake and never send `notifications/initialized`, so
    // this callback never fires for them. The era check below is therefore
    // defensive: if for any reason a modern-era client does trigger this callback,
    // skip `attachSink` to avoid sending unsolicited `notifications/message`
    // notifications, which are non-compliant under MCP 2026-07-28 (SEP-2577).
    const negotiatedVersion = server.server.getNegotiatedProtocolVersion();
    if (negotiatedVersion !== undefined && negotiatedVersion >= '2026-07-28') {
      return;
    }
    startupInfo?.logger.attachSink(async ({ level, data }) => {
      await server.server
        .notification({
          method: 'notifications/message',
          params: {
            level,
            logger: 'frodo-cli',
            data,
          },
        })
        .catch(() => undefined);
    });
  };

  for (const tool of service.listTools()) {
    const isDiscovery = tool.name === 'frodo_discover';
    const isFindSkills = tool.name === 'frodo_find_skills';
    const isDescribeSkill = tool.name === 'frodo_describe_skill';
    const isDispatchTool =
      tool.name === 'frodo_dispatch' ||
      tool.name === 'frodo_dispatch_read_only';
    const annotations: ToolAnnotations | undefined = tool.annotations
      ? { ...tool.annotations }
      : undefined;

    if (isDiscovery) {
      server.registerTool(
        tool.name,
        { description: tool.description, inputSchema: DISCOVERY_SHAPE },
        async (args, ctx) => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(
                undefined,
                buildTraceHandler(ctx, startupInfo?.logger),
                ctx.http?.authInfo
              ),
            });
            return buildSuccessResult(result);
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    } else if (isFindSkills) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: FIND_SKILLS_SHAPE,
          annotations,
        },
        async (args, ctx) => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(
                undefined,
                buildTraceHandler(ctx, startupInfo?.logger),
                ctx.http?.authInfo
              ),
            });
            return buildSuccessResult(result);
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    } else if (isDescribeSkill) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: DESCRIBE_SKILL_SHAPE,
          annotations,
        },
        async (args, ctx) => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(
                undefined,
                buildTraceHandler(ctx, startupInfo?.logger),
                ctx.http?.authInfo
              ),
            });
            return buildSuccessResult(result);
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    } else if (isDispatchTool) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: DISPATCH_SHAPE,
          annotations,
        },
        async (args, ctx) => {
          try {
            const realm =
              args && typeof args === 'object'
                ? ((args as { realm?: unknown }).realm as string | undefined)
                : undefined;
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(
                realm,
                buildTraceHandler(ctx, startupInfo?.logger),
                ctx.http?.authInfo
              ),
            });
            return buildSuccessResult(result);
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    } else {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: SPECIAL_SHAPE,
          annotations,
        },
        async (args, ctx) => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(
                undefined,
                buildTraceHandler(ctx, startupInfo?.logger),
                ctx.http?.authInfo
              ),
            });
            return buildSuccessResult(result);
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    }
  }

  return server;
}

// ---------------------------------------------------------------------------
// Public transport functions
// ---------------------------------------------------------------------------

/**
 * Starts an MCP stdio server that reads JSON-RPC from stdin and writes
 * responses to stdout.  The process runs until stdin is closed.
 *
 * @param service Fully composed MCP service.
 */
export async function startStdioTransport(
  service: McpService,
  startupInfo?: McpServerStartupInfo
): Promise<void> {
  // The stdio server lives for the process lifetime, so its crash handlers
  // do too — the dispose function is intentionally not kept (a live stdio
  // server never un-registers).
  registerServerCrashHandlers(startupInfo);
  serveStdio(() => buildMcpServer(service, startupInfo));
}

/** Runtime configuration for the HTTP transport. */
export type McpHttpTransportOptions = {
  /**
   * Extra `Host` header values to accept beyond the default localhost set
   * (`localhost`, `127.0.0.1`, `[::1]`). Needed whenever the server is
   * reached through a different hostname, e.g. `host.docker.internal` from a
   * bridge-network container on the same machine.
   */
  allowedHosts?: string[];
  /**
   * Bearer token required on `POST /mcp` requests when configured. `GET
   * /health` stays unauthenticated. Never logged.
   */
  authToken?: string;
  /**
   * Liveness heartbeat interval in milliseconds. Defaults to
   * {@linkcode MCP_HTTP_HEARTBEAT_INTERVAL_MS} (15 minutes). Exposed so
   * tests can exercise the emission/clearing lifecycle against real timers
   * without waiting a quarter hour.
   */
  heartbeatIntervalMs?: number;
  /**
   * Maximum accepted request body size in bytes on POST /mcp. Defaults to
   * {@linkcode DEFAULT_MCP_HTTP_MAX_BODY_SIZE_BYTES} (1 MiB). Enforced both
   * as a `Content-Length` pre-check (reject before reading a byte) and as an
   * accumulation cap inside the body reader (reject mid-stream on overflow).
   * Over-limit requests are answered `413` with a JSON-RPC error naming the
   * limit and the option that raises it.
   */
  maxBodySizeBytes?: number;
  /**
   * Maximum concurrent POST /mcp handler executions before new requests are
   * rejected with `429` + `Retry-After: 1` (queue-less reject — the client's
   * retry policy is the queue). Defaults to
   * {@linkcode DEFAULT_MCP_HTTP_MAX_CONCURRENT_REQUESTS} (64). Counts handler
   * executions, not held sockets: a slow SSE stream mid-write still occupies a
   * slot until its handler resolves.
   */
  maxConcurrentRequests?: number;
  /**
   * Configures the HTTP transport as an OAuth 2.1 resource server ("shared
   * mode"): each `POST /mcp` request presents its own bearer token, verified
   * against the target AM/AIC tenant, instead of a single shared secret
   * gating access to one identity pre-authenticated at startup. Mutually
   * exclusive with `authToken` (enforced by the caller, `server-start.ts`) —
   * a server is either shared-secret-gated or a real per-connection
   * resource server, never both.
   */
  oauthResourceServer?: McpOAuthResourceServerOptions;
};

/**
 * Minimal JWKS document shape needed to verify a token's signature — not
 * re-exported from frodo-lib's `JoseOps.ts` (an internal JOSE type, not a
 * public MCP-relevant symbol); `frodo.utils.jose.verifyJwtAgainstJwks()`
 * accepts this same shape.
 */
type JwksInterface = { keys: Record<string, unknown>[] };

/**
 * Resource-server configuration for the MCP HTTP transport's OAuth 2.1
 * "shared mode" (see `McpHttpTransportOptions.oauthResourceServer`).
 */
export type McpOAuthResourceServerOptions = {
  /** Verifies a caller-presented bearer token against the target tenant. */
  verifier: OAuthTokenVerifier;
  /** RFC 8414 Authorization Server metadata for the target tenant. */
  oauthMetadata: OAuthMetadata;
  /** This MCP server's own public URL (the RFC 9728 `resource` value). */
  resourceServerUrl: URL;
  /**
   * Optional post-verification hook: resolves a freshly-verified `AuthInfo`
   * into an enriched one that names a specific frodo-side credential to
   * actually use for this request (external-IDP "shared mode"'s claim-to-
   * service-account mapping — see `buildClaimMappedCredentialResolver`).
   * When omitted (AM-as-IdP mode), the verified token itself is used
   * directly as the AM credential — see `buildRequestContext`'s
   * bearer-token branch for how the two shapes are told apart.
   */
  resolveCredential?: (authInfo: AuthInfo) => Promise<AuthInfo>;
};

/**
 * Builds RFC 8414 Authorization Server metadata for an AM/AIC tenant's
 * OAuth2 Provider, from its well-known, deterministic endpoint URL scheme
 * (`OAuth2OIDCApi.ts`'s own templates) — root realm only for now, matching
 * `verifyMcpOAuthBearerToken`'s own root-realm-scoped tokeninfo call.
 *
 * @remarks
 * Hand-built rather than fetched live from the tenant's own discovery
 * document: AM's endpoint shape is fixed and already known to frodo-lib, so
 * a live fetch would only add a startup network dependency (and a new
 * failure mode) for information that's actually deterministic given
 * `amBaseUrl`.
 */
export function buildAmOAuthMetadata(amBaseUrl: string): OAuthMetadata {
  return {
    issuer: `${amBaseUrl}/oauth2`,
    authorization_endpoint: `${amBaseUrl}/oauth2/authorize`,
    token_endpoint: `${amBaseUrl}/oauth2/access_token`,
    jwks_uri: `${amBaseUrl}/oauth2/connect/jwk_uri`,
    response_types_supported: ['code'],
    grant_types_supported: [
      'authorization_code',
      'refresh_token',
      'urn:ietf:params:oauth:grant-type:device_code',
    ],
    token_endpoint_auth_methods_supported: [
      'none',
      'client_secret_post',
      'private_key_jwt',
    ],
    code_challenge_methods_supported: ['S256'],
  };
}

/**
 * Builds an {@link OAuthTokenVerifier} that verifies a caller-presented
 * bearer token by calling the target AM/AIC tenant's own `/oauth2/tokeninfo`
 * endpoint — the token IS the credential; this only confirms it's live and
 * extracts the granted scope/expiry/subject before the runtime wires it
 * onto a fresh, request-scoped Frodo instance (see
 * `AuthenticateOps.applyAccessToken()` in frodo-lib).
 */
export function buildAmTokenInfoVerifier(amBaseUrl: string): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let info;
      try {
        info = await frodo.oauth2oidc.endpoint.getTokenInfo(amBaseUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'Token is unknown, revoked, expired, or otherwise invalid for this tenant.'
        );
      }
      return {
        token,
        clientId: info.aud,
        scopes: info.scope ?? [],
        expiresAt: info.exp,
        extra: {
          sub: info.sub,
          realm: info.realm,
          tokenName: info.tokenName,
          // Present only when the issuing OAuth2 client has a
          // session-capture script configured (ForgeOps/classic) — see
          // AccessTokenMetaType's own sessionId field, the same shape.
          sessionToken: info.sessionToken,
        },
      };
    },
  };
}

/**
 * Fetches an OIDC provider's discovery document and JWKS once, at startup
 * — not per-request. A real production concern this deliberately doesn't
 * handle yet: key rotation mid-session (a JWKS fetched at startup can go
 * stale if the external IDP rotates its signing keys before the server is
 * restarted) — flagged here rather than silently assumed away.
 */
export async function fetchExternalIdpMetadata(
  issuerUrl: string
): Promise<{ oauthMetadata: OAuthMetadata; jwks: JwksInterface }> {
  const discoveryUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const discoveryResponse = await fetch(discoveryUrl);
  if (!discoveryResponse.ok) {
    throw new Error(
      `Failed to fetch OIDC discovery document from ${discoveryUrl}: HTTP ${discoveryResponse.status}`
    );
  }
  const oauthMetadata = (await discoveryResponse.json()) as OAuthMetadata & {
    jwks_uri?: string;
  };
  if (!oauthMetadata.jwks_uri) {
    throw new Error(
      `OIDC discovery document at ${discoveryUrl} has no jwks_uri.`
    );
  }
  const jwksResponse = await fetch(oauthMetadata.jwks_uri);
  if (!jwksResponse.ok) {
    throw new Error(
      `Failed to fetch JWKS from ${oauthMetadata.jwks_uri}: HTTP ${jwksResponse.status}`
    );
  }
  const jwks = (await jwksResponse.json()) as JwksInterface;
  return { oauthMetadata, jwks };
}

/**
 * Builds an {@link OAuthTokenVerifier} that verifies a caller-presented
 * bearer token against a third-party OIDC provider (Entra ID, Okta, etc.)
 * instead of the target AM/AIC tenant — external-IDP "shared mode".
 *
 * @remarks
 * Unlike {@link buildAmTokenInfoVerifier}, this never talks to AM at all:
 * verification is entirely local (signature against the IDP's own
 * published JWKS, plus issuer/audience/expiry checks) — the external
 * identity only gates access to this server; it is not, by itself, an AM
 * credential. See `buildClaimMappedCredentialResolver` for how a verified
 * external identity is actually mapped to something Frodo can use against
 * AM/IDM.
 */
export function buildExternalIdpVerifier(
  oauthMetadata: OAuthMetadata,
  jwks: JwksInterface,
  audience: string
): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      let claims: Record<string, unknown>;
      try {
        claims = await frodo.utils.jose.verifyJwtAgainstJwks(token, jwks);
      } catch {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          "Token signature could not be verified against the configured external IDP's published keys."
        );
      }
      if (claims.iss !== oauthMetadata.issuer) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'Token issuer does not match the configured external IDP.'
        );
      }
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (!audiences.includes(audience)) {
        throw new OAuthError(
          OAuthErrorCode.InvalidToken,
          'Token audience does not match the configured client.'
        );
      }
      const expiresAt = typeof claims.exp === 'number' ? claims.exp : undefined;
      if (!expiresAt || expiresAt * 1000 <= Date.now()) {
        throw new OAuthError(OAuthErrorCode.InvalidToken, 'Token is expired.');
      }
      const scopeClaim = claims.scope;
      return {
        token,
        clientId: String(
          claims.azp ?? (Array.isArray(claims.aud) ? claims.aud[0] : claims.aud)
        ),
        scopes: typeof scopeClaim === 'string' ? scopeClaim.split(' ') : [],
        expiresAt,
        // The full verified claim set — buildClaimMappedCredentialResolver
        // reads the operator-configured claim name out of this.
        extra: claims,
      };
    },
  };
}

/**
 * Builds the post-verification `resolveCredential` hook for external-IDP
 * "shared mode": reads the operator-configured claim off the verified
 * token, looks it up in the claim-mapping table, and — on a match —
 * fetches that named additional service account from the target
 * connection profile, attaching its id/JWK to the returned `AuthInfo` for
 * `buildRequestContext` to pick up.
 *
 * @throws (via a rejected `OAuthError(InsufficientScope)`, mapped to a
 * `403` challenge by `bearerAuthChallengeResponse`) when the token is
 * genuinely valid but nothing in the claim-mapping table matches — a
 * valid external identity with no configured access is a real, expected
 * outcome, not a bug, and must fail closed rather than fall back to any
 * default credential.
 */
export function buildClaimMappedCredentialResolver(
  claimMapping: McpClaimMappingConfig,
  host: string
): (authInfo: AuthInfo) => Promise<AuthInfo> {
  return async (authInfo: AuthInfo): Promise<AuthInfo> => {
    const serviceAccountName = resolveServiceAccountForClaims(
      claimMapping,
      authInfo.extra ?? {}
    );
    if (!serviceAccountName) {
      throw new OAuthError(
        OAuthErrorCode.InsufficientScope,
        `No claim mapping matched this token's '${claimMapping.claimName}' claim - access denied.`
      );
    }
    const account = await frodo.conn.getAdditionalServiceAccount(
      host,
      serviceAccountName
    );
    return {
      ...authInfo,
      extra: {
        ...authInfo.extra,
        resolvedServiceAccountId: account.svcacctId,
        resolvedServiceAccountJwk: account.svcacctJwk,
      },
    };
  };
}

/**
 * Verifies a raw `Authorization` header as a bearer token for the OAuth 2.1
 * resource-server mode. Thin wrapper over the SDK's `verifyBearerToken` —
 * exported so its exact call shape (which options it forwards) has direct
 * unit coverage without a real HTTP round trip.
 */
export function verifyMcpOAuthBearerToken(
  authorization: string | undefined,
  options: McpOAuthResourceServerOptions
): Promise<AuthInfo> {
  return verifyBearerToken(authorization, { verifier: options.verifier });
}

/**
 * Computes the effective `Host` header allow-list for the HTTP transport.
 *
 * The default localhost set (the SDK's `localhostAllowedHostnames()`) is
 * always included so the zero-config local case behaves exactly as before;
 * `allowedHosts` extends it. When binding a non-loopback interface,
 * `host.docker.internal` is auto-included — the standard Docker Desktop /
 * Linux `host-gateway` alias a bridge-network container uses to reach a
 * server on the host itself (the containerized AI gateway deployment model).
 *
 * Exported so the default/extension/auto-alias composition has direct unit
 * coverage without spinning up a real listener.
 */
export function computeHttpAllowedHosts(
  bindHost: string,
  allowedHosts?: string[]
): string[] {
  const effective = new Set(localhostAllowedHostnames());
  for (const host of allowedHosts ?? []) {
    if (host) {
      effective.add(host);
    }
  }
  if (!isLoopbackBindHost(bindHost)) {
    effective.add('host.docker.internal');
  }
  return [...effective];
}

/**
 * Whether a bind host only exposes the server to the local machine.
 *
 * Loopback means the loopback interface (any `127.x.y.z` address or `[::1]`)
 * or `localhost` itself. Bind hosts that cannot be parsed as addresses
 * (hostnames) are treated as non-loopback — the safe default for a guard
 * that decides whether a bearer token may be skipped.
 */
export function isLoopbackBindHost(bindHost: string): boolean {
  if (!bindHost) {
    return false;
  }
  const normalized = bindHost.toLowerCase();
  if (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]'
  ) {
    return true;
  }
  const family = isIP(bindHost);
  if (family === 6) {
    return normalized === '::1';
  }
  if (family === 4) {
    return normalized.startsWith('127.');
  }
  // Hostname (or wildcard like `0.0.0.0` is already an IP, handled above as
  // non-loopback): a name can resolve to anything, so treat as non-loopback.
  return false;
}

/**
 * Verifies an HTTP `Authorization` header against the configured bearer
 * token, timing-safely.
 *
 * Comparison runs over SHA-256 digests so `crypto.timingSafeEqual` can be
 * used regardless of the two lengths (it throws on unequal byte lengths),
 * without leaking the token length through early exits.
 *
 * Exported for direct unit coverage of the parsing and comparison rules —
 * silently accepting a malformed header shape would be a security bug, and
 * the 401 path below is exactly where that would live.
 *
 * @param authorization Raw `Authorization` header value.
 * @param authToken The configured bearer token.
 * @returns true when the header authenticates the request.
 */
export function verifyMcpBearerAuthorization(
  authorization: string | undefined,
  authToken: string
): boolean {
  if (!authorization || !authToken) {
    return false;
  }
  const [scheme, ...rest] = authorization.trim().split(/\s+/);
  const token = rest.join(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return false;
  }
  const provided = createHash('sha256').update(token, 'utf8').digest();
  const expected = createHash('sha256').update(authToken, 'utf8').digest();
  return timingSafeEqual(provided, expected);
}

/**
 * Starts a stateless MCP HTTP server using the Streamable HTTP transport.
 *
 * The MCP endpoint is `POST /mcp`. A `GET /health` endpoint is provided for
 * liveness probing. The `Host` header is validated against an allow-list
 * (localhost set plus any configured extras) and the `Origin` header against
 * the localhost set; when `options.authToken` is set, `POST /mcp` also
 * requires a matching `Authorization: Bearer` header.
 *
 * The function resolves when the server is stopped via SIGTERM, SIGINT,
 * SIGHUP, or SIGQUIT (the SSH-session survival signals — closing the terminal
 * that launched a long-lived HTTP server must release the port), resolves
 * with `process.exitCode = 1` after one actionable message when the port is
 * already in use (the deliberate-exit path — rejecting would double-print
 * through the global unhandledRejection handler), and rejects on other
 * server errors.
 *
 * After a successful `listen()` a PID lockfile
 * (`<config dir>/mcp-http-<resolved port>.pid`, see
 * {@linkcode writeMcpHttpLockfile}) records `{pid, port, bindHost, startedAt}`
 * so `frodo mcp server stop` can find and stop this server; it is removed on
 * every shutdown signal and best-effort on the crash path.
 *
 * @param service Fully composed MCP service.
 * @param bindHost Host interface to bind (e.g. `"127.0.0.1"`).
 * @param port TCP port to listen on (0 binds an OS-assigned port — the
 *   resolved port is printed and used for the lockfile).
 * @param startupInfo Startup logger context.
 * @param options Transport configuration (Host allow-list, bearer token,
 *   body/concurrency limits).
 */
export async function startHttpTransport(
  service: McpService,
  bindHost: string,
  port: number,
  startupInfo?: McpServerStartupInfo,
  options?: McpHttpTransportOptions
): Promise<void> {
  // The port actually bound: the OS assigns it when `port` is 0, and the
  // listen callback records it (AddressInfo.port). Every user-visible
  // mention — listening line, heartbeat, lockfile name, shutdown removal —
  // uses the resolved value; the requested value is only what listen() was
  // asked for.
  let resolvedPort = port;
  const mcpServer = buildMcpServer(service, startupInfo);
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);
  const validateHost = hostHeaderValidation(
    computeHttpAllowedHosts(bindHost, options?.allowedHosts)
  );
  const validateOrigin = localhostOriginValidation();
  const limiter = new McpHttpConcurrencyLimiter(
    options?.maxConcurrentRequests ?? DEFAULT_MCP_HTTP_MAX_CONCURRENT_REQUESTS
  );

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      // Per-request gate observability: every arrival/gate decision logs at
      // debug level only (default 'info' stays quiet). printMessage fallback
      // mirrors the shutdown-log pattern for the startupInfo-less tests.
      const debugLog = (message: string): void => {
        if (startupInfo) {
          startupInfo.logger.debug('http', message);
        } else {
          printMessage(message, 'debug');
        }
      };
      try {
        await handleHttpRequest(
          req,
          res,
          transport,
          validateHost,
          validateOrigin,
          options?.authToken,
          options?.maxBodySizeBytes ?? DEFAULT_MCP_HTTP_MAX_BODY_SIZE_BYTES,
          limiter,
          debugLog,
          options?.oauthResourceServer
        );
      } catch (err) {
        // The body-limit rejection travels this same path by design (a throw
        // from the reader): answer 413 with the JSON-RPC error shape and
        // destroy the socket so the unread remainder of the body is dropped
        // instead of sitting in a keep-alive connection. Everything else
        // stays the generic 500.
        if (err instanceof McpHttpBodyTooLargeError) {
          debugLog?.(
            `rejected: body too large (${err.receivedBytes ?? 'unknown'} bytes, limit ${
              options?.maxBodySizeBytes ?? DEFAULT_MCP_HTTP_MAX_BODY_SIZE_BYTES
            })`
          );
          writeJsonRpcErrorResponse(
            res,
            413,
            {
              jsonrpc: '2.0',
              id: null,
              error: {
                code: TRANSPORT_LIMIT_ERROR_CODE,
                message:
                  `Payload Too Large: the request body exceeds the configured limit ` +
                  `of ${
                    options?.maxBodySizeBytes ??
                    DEFAULT_MCP_HTTP_MAX_BODY_SIZE_BYTES
                  } bytes` +
                  (err.receivedBytes !== undefined
                    ? ` (received ${err.receivedBytes} bytes)`
                    : '') +
                  `. Raise it with --max-body-size <bytes> or FRODO_MCP_MAX_BODY_SIZE.`,
                data: {
                  limitBytes:
                    options?.maxBodySizeBytes ??
                    DEFAULT_MCP_HTTP_MAX_BODY_SIZE_BYTES,
                  receivedBytes: err.receivedBytes,
                },
              },
            },
            { Connection: 'close' }
          );
          res.on('finish', () => req.socket.destroy());
          return;
        }
        printMessage(
          `MCP HTTP handler error: ${err instanceof Error ? err.message : String(err)}`,
          'error'
        );
        if (!res.headersSent) {
          res.writeHead(500).end('Internal server error');
        }
      }
    }
  );

  // Server-mode crash handlers: registered only from the MCP server start
  // path (never from FrodoCommand), self-guarded against stacking, and
  // disposed when the transport stops so a later re-start re-registers
  // cleanly.
  const disposeCrashHandlers = registerServerCrashHandlers(startupInfo, {
    beforeExit: () => {
      // Best-effort lockfile removal on the crash path: an uncaughtException
      // exit leaves no shutdown signal to run the graceful cleanup, so the
      // crash path does it — a supervisor restart must not find a lockfile
      // naming the dead PID and read it as a live incumbent. (The PID
      // liveness check would eventually classify it stale, but only after a
      // misleading EADDRINUSE message.)
      removeMcpHttpLockfile(resolvedPort);
      httpServer.closeIdleConnections?.();
      httpServer.close();
    },
  });

  // Liveness heartbeat: one line every MCP_HTTP_HEARTBEAT_INTERVAL_MS so a
  // remote operator can tell a hung server from a healthy one. unref()ed —
  // the timer must never be the thing keeping the process alive — and
  // cleared on shutdown.
  const heartbeat = setInterval(
    () => {
      const line = `MCP HTTP server still listening on http://${bindHost}:${resolvedPort}/mcp (pid ${process.pid})`;
      if (startupInfo) {
        startupInfo.logger.info('heartbeat', line);
      } else {
        printMessage(line, 'info');
      }
    },
    resolveMcpHttpHeartbeatInterval(
      options?.heartbeatIntervalMs,
      process.env.FRODO_MCP_HEARTBEAT_INTERVAL_MS
    )
  );

  heartbeat.unref();

  return new Promise<void>((resolve, reject) => {
    httpServer.listen(port, bindHost, () => {
      // The resolved port, not the requested one: with `--port auto` (or a
      // literal 0) the OS assigns the port, and the printed URL is what an
      // operator points a client at — printing the requested 0 (or 'auto')
      // is the long-standing wrong-print this fixes.
      resolvedPort = (httpServer.address() as AddressInfo).port;
      const listeningLine = `MCP HTTP server (pid ${process.pid}) listening on http://${bindHost}:${resolvedPort}/mcp`;
      printMessage(listeningLine, 'info');
      // One cheap staleness note before the lockfile is overwritten: a
      // previous run that died without cleanup (crash without the best-effort
      // removal, kill -9, reboot) leaves a lockfile naming a dead PID, and the
      // operator who later wonders why `stop` says "stale lockfile" deserves
      // the matching line at start. Read-fail-tolerant by construction (the
      // reader returns null for missing/unreadable/malformed), and
      // race-tolerant: a concurrent writer's record is only consulted for
      // liveness, never modified here — the write below is the overwrite.
      const staleLockfile = readMcpHttpLockfile(resolvedPort);
      if (staleLockfile && !isPidAlive(staleLockfile.pid)) {
        printMessage(
          `MCP HTTP server: overwriting stale lockfile for port ${resolvedPort} (recorded pid ${staleLockfile.pid} is not running).`,
          'warn'
        );
      }
      // The PID lockfile is written only once the listener is actually up:
      // a record naming this process must not outlive a start that never
      // bound the port. Best-effort — a read-only config dir must not fail
      // the start (the lockfile is an operational aid, not a gate).
      if (
        !writeMcpHttpLockfile({
          pid: process.pid,
          port: resolvedPort,
          bindHost,
          startedAt: new Date().toISOString(),
        })
      ) {
        printMessage(
          `MCP HTTP server: could not write the PID lockfile at ${getMcpHttpLockfilePath(resolvedPort)}; 'frodo mcp server stop' will not find this server by it.`,
          'warn'
        );
      }
      // Test/debug-only crash hook: when FRODO_MCP_CRASH_TEST=1, throw an
      // uncaught exception shortly after the listener is up so the
      // uncaughtException crash path (crash line, best-effort port release,
      // exit 1) can be exercised end to end in a spawned child — the path
      // cannot run inside a jest worker without killing the suite. Never
      // set in production; documented as test/debug-only in
      // docs/MCP_CLIENT_SETUP.md.
      if (process.env.FRODO_MCP_CRASH_TEST === '1') {
        setTimeout(() => {
          throw new Error('FRODO_MCP_CRASH_TEST uncaught exception probe');
        }, 25);
      }
    });

    httpServer.on('error', async (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        // One actionable line, then a deliberate exit (exit code 1 via
        // exitCode, promise resolved) — rejecting would surface through the
        // global unhandledRejection handler in FrodoCommand.ts and print a
        // second, noisier "please report this unhandled error" block for a
        // completely expected condition. The same teardown the shutdown
        // path runs (heartbeat clear + crash-handler dispose) runs here too:
        // a resolved-but-poisoned-exitCode process should not keep a
        // heartbeat timer or process-level handlers registered.
        clearInterval(heartbeat);
        disposeCrashHandlers();
        // No lockfile removal here: this process never wrote one (the
        // write happens only after a successful listen), and the
        // incumbent's lockfile is the incumbent's to manage.
        const incumbent = await probeHttpServerHealth(port);
        // When a lockfile for this port names a live PID, that PID is the
        // incumbent — name it directly so `frodo mcp server stop` (or a
        // manual kill) needs no lsof round trip. The health-probe wording
        // stays as the fallback for a squatter with no lockfile.
        const incumbentLockfile = readMcpHttpLockfile(port);
        const incumbentPid =
          incumbentLockfile && isPidAlive(incumbentLockfile.pid)
            ? incumbentLockfile.pid
            : undefined;
        printMessage(
          `MCP HTTP server: port ${port} on ${bindHost} is already in use — ` +
            (incumbentPid !== undefined
              ? `a process is already listening (pid ${incumbentPid}, from the lockfile). Stop it: frodo mcp server stop --port ${port}. `
              : incumbent
                ? `another MCP server is answering on this port (a health probe succeeded). `
                : `another frodo mcp server (or other process) is likely listening. `) +
            `Find it: lsof -iTCP:${port} -sTCP:LISTEN. ` +
            `Use --port <other> or stop the incumbent.`,
          'error'
        );
        process.exitCode = 1;
        resolve();
        return;
      }
      printMessage(`MCP HTTP server error: ${err.message}`, 'error');
      reject(err);
    });

    const shutdown = (signal: NodeJS.Signals) => {
      // One terse line per received signal: when shutdown is triggered
      // remotely (SSH hangup, orchestrator stop), the log is the only
      // record of which signal caused it.
      const signalLog = `received ${signal}, shutting down MCP HTTP server`;
      if (startupInfo) {
        startupInfo.logger.info('shutdown', signalLog);
      } else {
        printMessage(signalLog, 'info');
      }
      clearInterval(heartbeat);
      disposeCrashHandlers();
      // The lockfile must go before the promise resolves: a supervisor that
      // restarts the server immediately must not read a stale record naming
      // a PID about to exit.
      removeMcpHttpLockfile(resolvedPort);
      // Stop accepting connections immediately, then force-close any
      // keep-alive sockets so the port is released deterministically even
      // when a client (or gateway) holds an idle persistent connection —
      // closeIdleConnections is what makes SIGHUP from a closing SSH
      // session actually free the port.
      httpServer.closeIdleConnections?.();
      httpServer.close(() => resolve());
    };
    // SIGHUP (terminal closed) and SIGQUIT (Ctrl+\) join SIGTERM/SIGINT so
    // closing the SSH session that launched the server releases the port
    // instead of orphaning the listener.
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    process.once('SIGHUP', shutdown);
    process.once('SIGQUIT', shutdown);
  });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Best-effort liveness probe against a likely incumbent on `127.0.0.1:port`
 * (used by the EADDRINUSE path). Resolves true only when an HTTP server
 * answers `GET /health` within the timeout — a plain TCP connect would also
 * succeed for a dead-but-listening socket or any non-HTTP squatter, which
 * would overstate what is on the port. Never rejects: a probe failure just
 * means "no evidence of an MCP server", the pre-existing message.
 */
async function probeHttpServerHealth(
  port: number,
  timeoutMs = 500
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      req.destroy();
      resolve(value);
    };
    const req = httpRequest(
      {
        host: '127.0.0.1',
        port,
        method: 'GET',
        path: '/health',
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        settle(res.statusCode === 200);
      }
    );
    req.on('timeout', () => settle(false));
    req.on('error', () => settle(false));
    req.end();
  });
}

/**
 * Routes a single HTTP request to the appropriate MCP transport handler.
 *
 * Every gate decision is logged at DEBUG level (`http` event) so an operator
 * running `--mcp-log-level debug` can tell "requests arrive and are rejected
 * at a gate" apart from "requests never arrive" — the incident behind this
 * logging: a gateway reported Unauthorized at initialize while frodo's
 * console showed nothing, leaving the two causes indistinguishable. Default
 * (`info`) level stays quiet; never logged: Authorization header values or
 * any token material (header PRESENCE is fine, contents never are), request
 * bodies (only the body's JSON-RPC method name, which carries no secrets).
 *
 * Frodo transport-policy limits run alongside the protocol gates: the
 * `Content-Length` pre-check rejects an over-limit body before a byte is
 * read, and POST handler executions acquire a concurrency slot (see
 * {@linkcode McpHttpConcurrencyLimiter}) — over-limit requests get `429` +
 * `Retry-After: 1` without being queued.
 */
async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  transport: NodeStreamableHTTPServerTransport,
  validateHost: (req: IncomingMessage, res: ServerResponse) => boolean,
  validateOrigin: (req: IncomingMessage, res: ServerResponse) => boolean,
  authToken: string | undefined,
  maxBodySizeBytes: number,
  limiter: McpHttpConcurrencyLimiter,
  debug: ((message: string) => void) | undefined,
  oauthResourceServer?: McpOAuthResourceServerOptions
): Promise<void> {
  // Arrival line: even 404s and health probes are visible at debug level.
  // The path only, never the query string: the URL is logged before any
  // routing decision, and a caller that put secret material in a query
  // parameter (`/mcp?token=...`) must not see it echoed into the log.
  const routePath = req.url?.split('?')[0] ?? '';
  debug?.(
    `${req.method} ${routePath} from ${req.socket?.remoteAddress ?? 'unknown'}`
  );
  // Route matching ignores the query string: a request to `/mcp?x=y` names
  // the same endpoint (RFC 9110 — the query is not part of the path). The
  // health probe keeps its exact match; it has no query-bearing caller and
  // the widened auth surface below stays in lockstep (the bearer gate keys
  // on the same route, so widening it widens the authed surface identically
  // — no change in exposure).

  // RFC 9728/8414 discovery, OAuth-resource-server mode only: served before
  // any other routing so a client (or gateway) that hasn't authenticated
  // yet can still discover the Authorization Server. GET-only — discovery
  // documents are always fetched with GET, and toWebRequest() would
  // otherwise consume a POST /mcp body meant for the transport below.
  if (req.method === 'GET' && oauthResourceServer) {
    const webRequest = await toWebRequest(req);
    const discoveryResponse = await oauthMetadataResponse(webRequest, {
      oauthMetadata: oauthResourceServer.oauthMetadata,
      resourceServerUrl: oauthResourceServer.resourceServerUrl,
      resourceName: MCP_SERVER_NAME,
    });
    if (discoveryResponse) {
      debug?.(`discovery: served ${routePath}`);
      await writeWebResponse(res, discoveryResponse);
      return;
    }
  }

  // Health probe — deliberately unauthenticated: liveness probes must not
  // need secrets, and the body leaks only `{ status: 'ok' }`.
  if (req.method === 'GET' && routePath === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (routePath !== '/mcp') {
    debug?.(`rejected: 404 ${routePath} is not the MCP endpoint`);
    res.writeHead(404).end('Not found');
    return;
  }

  // Each validator writes its own 403 response when it rejects, so call each
  // at most once; the debug line names which gate and what it saw.
  const hostOk = validateHost(req, res);
  if (!hostOk) {
    debug?.(`rejected: invalid Host header ${req.headers.host ?? '(none)'}`);
    return;
  }
  if (!validateOrigin(req, res)) {
    debug?.(
      `rejected: invalid Origin header ${req.headers.origin ?? '(none)'}`
    );
    return;
  }

  if (req.method !== 'POST') {
    debug?.(`rejected: 405 ${req.method} on ${routePath}`);
    res.writeHead(405).end('Method not allowed');
    return;
  }

  // Bearer-token gate (SEP-2243-adjacent): enforced on every /mcp request
  // whenever a token is configured, loopback or not. /health above stays
  // open. The WWW-Authenticate challenge matches the SDK's own
  // bearerAuthChallengeResponse shape for invalid/missing tokens.
  if (authToken !== undefined) {
    const authorization = getSingleHeaderValue(req, 'authorization');
    if (!verifyMcpBearerAuthorization(authorization, authToken)) {
      // Presence only, never contents: whether an Authorization header was
      // sent is operationally useful (missing vs wrong token), its value is
      // secret material and must never reach a log line.
      debug?.(
        authorization === undefined
          ? 'rejected: unauthorized (no Authorization header)'
          : 'rejected: unauthorized (Authorization header did not verify)'
      );
      writeJsonRpcErrorResponse(
        res,
        401,
        {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32001,
            message: 'Unauthorized: a valid bearer token is required.',
          },
        },
        { 'WWW-Authenticate': 'Bearer error="invalid_token"' }
      );
      return;
    }
  }

  // OAuth 2.1 resource-server gate ("shared mode"): mutually exclusive with
  // the static-secret gate above (server-start.ts's CLI wiring enforces
  // this — a server is either shared-secret-gated or a real per-connection
  // resource server, never both). On success, the verified AuthInfo is
  // attached to `req` so the transport forwards it to every tool-call
  // handler as `ctx.http.authInfo` (see buildRequestContext's bearer-token
  // branch) — this request's identity, not the process's.
  let oauthAuthInfo: AuthInfo | undefined;
  if (oauthResourceServer) {
    const authorization = getSingleHeaderValue(req, 'authorization');
    try {
      oauthAuthInfo = await verifyMcpOAuthBearerToken(
        authorization,
        oauthResourceServer
      );
      // External-IDP mode only: maps the verified external identity's
      // claims to a specific frodo-side credential (AM-as-IdP mode has no
      // resolver — the verified token itself already IS the AM
      // credential). Runs on every request, not just once — cheap (a
      // local table lookup plus one already-cached-locally-encrypted
      // profile read), and correctly reflects a claim-mapping table the
      // operator could update between requests without restarting.
      if (oauthResourceServer.resolveCredential) {
        oauthAuthInfo = await oauthResourceServer.resolveCredential(
          oauthAuthInfo
        );
      }
      debug?.(
        `oauth: verified bearer token (clientId=${oauthAuthInfo.clientId})`
      );
    } catch (error) {
      debug?.(
        authorization === undefined
          ? 'rejected: unauthorized (no Authorization header)'
          : `rejected: unauthorized (${error instanceof OAuthError ? error.code : 'verification failed'})`
      );
      await writeWebResponse(
        res,
        bearerAuthChallengeResponse(error, {
          resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(
            oauthResourceServer.resourceServerUrl
          ),
        })
      );
      return;
    }
  }

  // Concurrency gate (frodo transport policy, queue-less): taken AFTER auth
  // so an unauthenticated flood cannot occupy slots just by being rejected
  // for the token, but BEFORE any body read so an over-cap request never
  // buffers its payload at all. Non-POST requests (health probes, 404/405
  // paths) never take a slot — they answer from the wire alone.
  if (req.method === 'POST' && !limiter.tryAcquire()) {
    debug?.(
      `rejected: 429 server busy (${limiter.load} in-flight, cap ${limiter.max})`
    );
    writeJsonRpcErrorResponse(
      res,
      429,
      {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: TRANSPORT_LIMIT_ERROR_CODE,
          message:
            `Server busy: the MCP server already has ${limiter.max} requests in flight ` +
            `(server max concurrent requests is ${limiter.max}). ` +
            'Retry after a short delay (queue-less reject — gateways retry).',
          data: {
            maxConcurrentRequests: limiter.max,
            inFlight: limiter.load,
          },
        },
      },
      { 'Retry-After': '1' }
    );
    return;
  }

  // Content-Length pre-check: reject an over-limit declared body BEFORE any
  // byte is buffered. (Requests without Content-Length — chunked uploads —
  // are covered by the accumulation cap inside readJsonBody.) A lying
  // Content-Length smaller than the truth still gets caught mid-stream by
  // that cap.
  //
  // From the slot acquisition to the response's last byte — including the
  // Content-Length rejection, the body parse (success, invalid-JSON 400, AND
  // the mid-stream 413 rethrow), every protocol-gate rejection, and the
  // transport call — the slot is held; the single finally below releases it
  // on every exit path. (The invalid-JSON return must release too: a
  // malformed-JSON flood would otherwise hold slots forever, shrinking the
  // effective cap to zero one bad request at a time.)
  try {
    if (req.method === 'POST') {
      const contentLengthHeader = getSingleHeaderValue(req, 'content-length');
      if (contentLengthHeader !== undefined) {
        const declared = Number(contentLengthHeader);
        if (Number.isFinite(declared) && declared > maxBodySizeBytes) {
          debug?.(
            `rejected: 413 Content-Length ${declared} exceeds limit ${maxBodySizeBytes}`
          );
          writeJsonRpcErrorResponse(
            res,
            413,
            {
              jsonrpc: '2.0',
              id: null,
              error: {
                code: TRANSPORT_LIMIT_ERROR_CODE,
                message:
                  `Payload Too Large: Content-Length ${contentLengthHeader} exceeds the ` +
                  `configured limit of ${maxBodySizeBytes} bytes. Raise it with ` +
                  `--max-body-size <bytes> or FRODO_MCP_MAX_BODY_SIZE.`,
                data: {
                  limitBytes: maxBodySizeBytes,
                  receivedBytes: declared,
                },
              },
            },
            { Connection: 'close' }
          );
          res.on('finish', () => req.socket.destroy());
          return;
        }
      }
    }

    // Parse body for POST
    let body: unknown;
    try {
      body = await readJsonBody(req, maxBodySizeBytes);
    } catch (err) {
      // The over-limit rejection is rethrown for the caller's 413 path (it
      // needs socket teardown this function should not own); anything else is
      // the pre-existing 400.
      if (err instanceof McpHttpBodyTooLargeError) {
        throw err;
      }
      debug?.('rejected: invalid JSON body');
      res.writeHead(400).end('Invalid JSON body');
      return;
    }

    // Empty JSON-RPC batch (SDK `classifyBatch` parity): the hand-wired
    // transport would silently answer 202 for an array with no elements, so
    // reject it here the way the SDK's own classifier does.
    if (Array.isArray(body) && body.length === 0) {
      debug?.('rejected: empty JSON-RPC batch');
      const rejection = buildMetadataValidationError(
        null,
        INVALID_REQUEST_ERROR_CODE,
        EMPTY_BATCH_ERROR_MESSAGE
      );
      writeJsonRpcErrorResponse(res, rejection.statusCode, {
        jsonrpc: '2.0',
        id: rejection.requestId,
        error: {
          code: rejection.error.code,
          message: rejection.error.message,
          data: rejection.error.data,
        },
      });
      return;
    }

    // Batch carrying a modern envelope claim on any element (SDK
    // `classifyBatch` `batch-with-modern-element` parity): the per-request
    // envelope mechanism has no batch semantics in the 2026 era, so the SDK
    // rejects a batch containing ANY claimed element — presence-only check,
    // the claim's validity (or era) is never consulted. The check precedes
    // metadata validation on purpose: element-level classification never
    // happens for a forwarded batch, so the claim would otherwise be silently
    // ignored.
    if (Array.isArray(body) && body.some(hasEnvelopeClaim)) {
      debug?.('rejected: batch carries a per-request envelope claim');
      const rejection = buildMetadataValidationError(
        null,
        INVALID_REQUEST_ERROR_CODE,
        BATCH_WITH_MODERN_ELEMENT_ERROR_MESSAGE
      );
      writeJsonRpcErrorResponse(res, rejection.statusCode, {
        jsonrpc: '2.0',
        id: rejection.requestId,
        error: {
          code: rejection.error.code,
          message: rejection.error.message,
          data: rejection.error.data,
        },
      });
      return;
    }

    // Enforce dual Accept header (MCP spec requirement)
    const accept = (req.headers['accept'] ?? '').toLowerCase();
    if (
      !accept.includes('application/json') ||
      !accept.includes('text/event-stream')
    ) {
      debug?.(`rejected: 406 Accept header ${req.headers.accept ?? '(none)'}`);
      res
        .writeHead(406)
        .end(
          'Not Acceptable: Client must accept both application/json and text/event-stream'
        );
      return;
    }

    const metadataValidationError = validateHttpRequestMetadata(req, body);
    if (metadataValidationError) {
      debug?.(
        `rejected: metadata gate ${metadataValidationError.error.code} (${metadataValidationError.error.message})`
      );
      writeJsonRpcErrorResponse(res, metadataValidationError.statusCode, {
        jsonrpc: '2.0',
        id: metadataValidationError.requestId,
        error: {
          code: metadataValidationError.error.code,
          message: metadataValidationError.error.message,
          data: metadataValidationError.error.data,
        },
      });
      return;
    }

    const protocolVersionError = getUnsupportedProtocolVersionError(req, body);
    if (protocolVersionError) {
      const errorData = protocolVersionError.error.data as
        { requested?: string } | undefined;
      debug?.(
        `rejected: unsupported protocol version ${errorData?.requested ?? '(unnamed)'}`
      );
      writeJsonRpcErrorResponse(res, protocolVersionError.statusCode, {
        jsonrpc: '2.0',
        id: protocolVersionError.requestId,
        error: {
          code: protocolVersionError.error.code,
          message: protocolVersionError.error.message,
          data: protocolVersionError.error.data,
        },
      });
      return;
    }

    // All gates passed — the one acceptance line, with the body's JSON-RPC
    // method (not the body itself; method names carry no secrets and make the
    // accepted traffic pattern readable).
    debug?.(
      `POST /mcp accepted from ${req.socket?.remoteAddress ?? 'unknown'}${extractBodyMethod(body) ? ` (${extractBodyMethod(body)})` : ''}`
    );
    // Pass-through: the transport forwards this verified identity to every
    // tool-call handler on this one request as `ctx.http.authInfo` — never
    // read from request headers by the transport itself (see
    // NodeStreamableHTTPServerTransport.handleRequest's own contract).
    const requestWithAuth = req as IncomingMessage & { auth?: AuthInfo };
    if (oauthAuthInfo) {
      requestWithAuth.auth = oauthAuthInfo;
    }
    await transport.handleRequest(requestWithAuth, res, body);
  } finally {
    limiter.release();
  }
}

/**
 * Writes a web-standard {@link Response} (from an SDK helper like
 * `oauthMetadataResponse`/`bearerAuthChallengeResponse`) to a raw Node
 * `ServerResponse`. Discovery documents and OAuth error bodies are always
 * small, fully-buffered JSON — no streaming needed.
 */
async function writeWebResponse(
  res: ServerResponse,
  response: Response
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/**
 * Reads and parses the JSON body from an incoming HTTP request, refusing to
 * buffer past `maxBytes`.
 *
 * The accumulation cap is what makes the read bounded: chunks past the limit
 * stop being buffered immediately and the promise rejects mid-stream, so a
 * Content-Length-less chunked upload cannot grow the buffer without bound
 * either (the Content-Length pre-check in handleHttpRequest only covers
 * requests that declare a length). The reported `receivedBytes` is the byte
 * count actually observed up to and including the chunk that tripped the cap
 * (never more — the stream is not read past that point — and only equal to
 * the limit in the single-chunk-overshoot corner).
 */
function readJsonBody(
  req: IncomingMessage,
  maxBytes: number
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    const rejectTooLarge = (receivedBytes: number): void => {
      if (settled) {
        return;
      }
      settled = true;
      // Stop buffering; the remaining stream data is discarded (the caller
      // destroys the socket after answering 413 — there is nothing useful
      // left to read).
      req.pause();
      reject(
        new McpHttpBodyTooLargeError(
          `Request body exceeded the ${maxBytes}-byte limit`,
          receivedBytes
        )
      );
    };
    req.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        // Report what was actually OBSERVED, not the cap: at this point
        // totalBytes is the first total that crossed the limit (the chunk
        // that tripped it included), which is honest and — for the common
        // small-overshoot case — close to the body's true size. (The old
        // behavior reported `maxBytes` here, which named the limit twice —
        // once as `receivedBytes`, once as `limitBytes`.)
        rejectTooLarge(totalBytes);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', (err) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(err);
    });
  });
}

/**
 * Validates MCP request metadata headers against the request body,
 * era-conditionally.
 *
 * 2026-era (SEP-2243) clients send an `MCP-Protocol-Version` header plus a
 * per-request `_meta` envelope claim, and `Mcp-Method`/`Mcp-Name` headers
 * mirroring the body; those requests get the full header cross-checks.
 * 2025-era clients (LiteLLM defaults to 2025-11-25, Kong gateways ship
 * 2025-06-18) send none of that — requiring the modern headers on them used
 * to 400 every request at frodo's HTTP layer before the SDK handshake ever
 * ran. Era is therefore inferred per request, mirroring the SDK's
 * `classifyInboundRequest` body-primary semantics:
 *
 * - An `initialize` request is legacy-handshake traffic by definition (the
 *   modern era has no initialize), unless it carries a `_meta` envelope
 *   claim naming a modern revision.
 * - A body `_meta` envelope claim classifies the request into the era its
 *   revision belongs to; a header naming a different revision than the
 *   claim is a mismatch.
 * - A modern (`>= 2026-07-28`) `MCP-Protocol-Version` header on a request
 *   without an envelope claim is invalid (-32602) — the SDK's
 *   `modern-header-without-claim` cell. Notifications get the SDK's
 *   narrower `classifyNotificationBody` semantics instead (see the
 *   notification branch below): only the claim's string-ness is validated.
 * - Legacy traffic requires none of the modern headers, and stray
 *   `Mcp-Method`/`Mcp-Name` headers on legacy traffic are ignored (SDK
 *   parity — never enforced on legacy traffic).
 *
 * Returns a spec-aligned error when a rule fires: -32020 (HeaderMismatch)
 * for header/body disagreements, -32602 (invalid params) for a modern
 * header without the envelope claim it must accompany and for a
 * present-but-malformed envelope claim (SDK `envelope-invalid` parity — a
 * malformed claim is a validation error, never a silent fallback to legacy
 * handling). Null when the request may proceed.
 */
export function validateHttpRequestMetadata(
  req: IncomingMessage,
  body: unknown
): MetadataValidationHttpError | null {
  const requestId = extractRequestId(body);
  const headerProtocolVersion = getSingleHeaderValue(
    req,
    'mcp-protocol-version'
  );
  const bodyProtocolVersion = extractBodyProtocolVersion(body);
  const bodyMethod = extractBodyMethod(body);
  const isNotification = isJsonRpcNotification(body);

  const envelopeClaim = extractEnvelopeClaim(body);
  const headerIsModern = isModernProtocolVersion(headerProtocolVersion);

  // `initialize` precedence rule (SDK parity — `carriesValidModernEnvelopeClaim`):
  // only a VALID modern envelope claim (the claim key carries a modern
  // revision string AND the envelope passes `validateEnvelopeMeta`, i.e. the
  // required client-capabilities key is present) overrides the
  // legacy-handshake classification. A modern claim missing the capabilities
  // key is an invalid envelope, and per the SDK an initialize carrying one
  // stays legacy traffic (verified live: an initialize with
  // `_meta{protocolVersion:'2026-07-28'}` and no capabilities key classifies
  // `legacy`, reason `initialize` — not `envelope-invalid`).
  if (
    bodyMethod === 'initialize' &&
    !carriesValidModernEnvelopeClaim(envelopeClaim)
  ) {
    if (headerIsModern) {
      return buildMetadataValidationError(
        requestId,
        HEADER_MISMATCH_ERROR_CODE,
        'Bad Request: the request headers and body disagree: an initialize request (legacy handshake) was sent with a modern MCP-Protocol-Version header',
        {
          mismatch: { header: headerProtocolVersion, body: 'initialize' },
        }
      );
    }
    return null;
  }

  if (isNotification) {
    // Notifications mirror the SDK's `classifyNotificationBody` exactly,
    // which is NARROWER than the request path's envelope validation (both
    // verified live against classifyInboundRequest):
    //
    // - A string claim names the notification's era and requires NO
    //   capabilities key: the SDK serves a claimed notification without
    //   `clientCapabilities` (kind=modern, revision from the claim — modern
    //   and legacy-dated claims alike). Only the claim's presence and the
    //   string-ness of its value are checked.
    // - A present claim with a NON-STRING value is the one invalid shape:
    //   -32602 `notification-envelope-invalid`, keyed on the claim key's
    //   own problem (the SDK's `.find(key === PROTOCOL_VERSION_META_KEY)` —
    //   a caps issue beside a non-string claim is never reported).
    // - The header/body version cross-check applies whenever a header names
    //   a different revision than the claim (modern OR legacy-dated claim).
    // - The Mcp-Method cross-check applies only when the notification
    //   classifies modern; on a legacy-dated or claim-less notification a
    //   mismatched Mcp-Method header is ignored (SDK parity — verified
    //   live: both classify served, not rejected).
    const malformedClaimError = buildNotificationEnvelopeInvalidError(
      envelopeClaim,
      requestId
    );
    if (malformedClaimError) {
      return malformedClaimError;
    }
    if (
      envelopeClaim.hasClaim &&
      headerProtocolVersion !== undefined &&
      envelopeClaim.version !== undefined &&
      headerProtocolVersion !== envelopeClaim.version
    ) {
      return buildHeaderMismatchError(requestId, {
        headerProtocolVersion,
        bodyProtocolVersion: envelopeClaim.version,
      });
    }
    const headerMethod = getSingleHeaderValue(req, 'mcp-method');
    // The method cross-check fires only for modern-classified
    // notifications: a modern-claim notification (whatever the header says)
    // or a claim-less notification under a modern header. A legacy-dated
    // claim, or a claim-less notification without a modern header,
    // classifies legacy-era and ignores a stray Mcp-Method header — SDK
    // parity (verified live: both shapes serve, not reject).
    const notificationClassifiesModern = envelopeClaim.hasClaim
      ? isModernProtocolVersion(envelopeClaim.version)
      : headerIsModern;
    if (
      notificationClassifiesModern &&
      headerMethod !== undefined &&
      bodyMethod !== undefined &&
      headerMethod !== bodyMethod
    ) {
      return buildHeaderMismatchError(requestId, {
        headerMethod,
        bodyMethod,
      });
    }
    return null;
  }

  if (envelopeClaim.hasClaim) {
    // A present claim whose value is not a string is malformed, not
    // claim-less: rejecting here (SDK `envelope-invalid` parity) is what
    // keeps a bad value from downgrading the request to legacy handling
    // with every modern cross-check silently skipped. The full envelope
    // shape is validated here too (the SDK's `validateEnvelopeMeta` parity —
    // see buildEnvelopeInvalidError): a modern claim without the required
    // client-capabilities key is an invalid envelope, not claim-less
    // traffic.
    const malformedClaimError = buildEnvelopeInvalidError(
      envelopeClaim,
      requestId
    );
    if (malformedClaimError) {
      return malformedClaimError;
    }
    if (
      headerProtocolVersion !== undefined &&
      envelopeClaim.version !== undefined &&
      headerProtocolVersion !== envelopeClaim.version
    ) {
      return buildHeaderMismatchError(requestId, {
        headerProtocolVersion,
        bodyProtocolVersion: envelopeClaim.version,
      });
    }
    if (!isModernProtocolVersion(envelopeClaim.version)) {
      // A claim naming a pre-2026 revision classifies legacy-era traffic.
      return null;
    }
    return validateModernRequestMetadata(
      req,
      body,
      requestId,
      headerProtocolVersion,
      bodyProtocolVersion,
      bodyMethod
    );
  }

  if (headerIsModern) {
    // Modern header without the envelope claim: the SDK's
    // modern-header-without-claim cell (-32602, invalid params). The missing
    // key list names every required envelope key absent from the claim's
    // `_meta` (SDK `validateEnvelopeMeta` parity: a `_meta` that already
    // carries the claim key but lacks the capabilities key lists BOTH; a
    // claim-less `_meta` lists just the claim key; no `_meta` lists '_meta').
    const params = getRequestParams(body);
    const meta =
      params?._meta &&
      typeof params._meta === 'object' &&
      !Array.isArray(params._meta)
        ? (params._meta as Record<string, unknown>)
        : undefined;
    const missing = meta
      ? REQUIRED_ENVELOPE_KEYS.filter((key) => !(key in meta))
      : ['_meta'];
    return buildMetadataValidationError(
      requestId,
      INVALID_PARAMS_ERROR_CODE,
      `Invalid params: the MCP-Protocol-Version header names protocol revision ${headerProtocolVersion}, but the request is missing the required per-request envelope key(s): ${missing.join(', ')}`,
      { envelope: { missing } }
    );
  }

  // No claim, no modern header: legacy traffic — modern headers not required.
  return null;
}

/**
 * Full SEP-2243 checks for a modern-classified request: the
 * `MCP-Protocol-Version` header must be present and agree with the body's
 * envelope claim, the `Mcp-Method` header must be present and agree with the
 * JSON-RPC method, and the `Mcp-Name` header must be present and agree with
 * the body value it mirrors for the methods that have one.
 */
function validateModernRequestMetadata(
  req: IncomingMessage,
  body: unknown,
  requestId: string | number | null,
  headerProtocolVersion: string | undefined,
  bodyProtocolVersion: string | undefined,
  bodyMethod: string | undefined
): MetadataValidationHttpError | null {
  if (!headerProtocolVersion) {
    return buildHeaderMismatchError(requestId, {
      header: 'mcp-protocol-version',
    });
  }
  if (!bodyProtocolVersion) {
    return buildHeaderMismatchError(requestId, {
      field: '_meta.protocolVersion',
    });
  }
  if (headerProtocolVersion !== bodyProtocolVersion) {
    return buildHeaderMismatchError(requestId, {
      headerProtocolVersion,
      bodyProtocolVersion,
    });
  }

  const headerMethod = getSingleHeaderValue(req, 'mcp-method');
  if (!headerMethod) {
    return buildHeaderMismatchError(requestId, { header: 'mcp-method' });
  }
  if (!bodyMethod) {
    return buildHeaderMismatchError(requestId, { field: 'method' });
  }
  if (headerMethod !== bodyMethod) {
    return buildHeaderMismatchError(requestId, {
      headerMethod,
      bodyMethod,
    });
  }

  const sourceField = MCP_NAME_HEADER_SOURCE[bodyMethod];
  if (sourceField !== undefined) {
    const headerName = getSingleHeaderValue(req, 'mcp-name');
    const bodyName = extractBodyName(bodyMethod, body);
    if (!headerName) {
      return buildHeaderMismatchError(requestId, {
        header: 'mcp-name',
        method: bodyMethod,
      });
    }
    if (!bodyName) {
      return buildHeaderMismatchError(requestId, {
        field: `params.${sourceField}`,
        method: bodyMethod,
      });
    }
    if (headerName !== bodyName) {
      return buildHeaderMismatchError(requestId, {
        headerName,
        bodyName,
        method: bodyMethod,
      });
    }
  }

  return null;
}

type UnsupportedVersionHttpError = {
  statusCode: 400;
  requestId: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type MetadataValidationHttpError = {
  statusCode: 400;
  requestId: string | number | null;
  error: {
    /** -32020 (HeaderMismatch), -32602 (invalid params), or -32600 (InvalidRequest). */
    code: number;
    message: string;
    data?: unknown;
  };
};

const HEADER_MISMATCH_ERROR_CODE = -32020 as const;
const INVALID_PARAMS_ERROR_CODE = -32602 as const;
const INVALID_REQUEST_ERROR_CODE = -32600 as const;

// The keys the 2026-07-28 per-request envelope requires (SDK parity — the
// SDK's REQUIRED_ENVELOPE_KEYS; verified via `validateEnvelopeMeta`).
const CLIENT_CAPABILITIES_META_KEY =
  'io.modelcontextprotocol/clientCapabilities';
const REQUIRED_ENVELOPE_KEYS = [
  PROTOCOL_VERSION_META_KEY,
  CLIENT_CAPABILITIES_META_KEY,
];

// The SDK's `empty-batch` / `batch-with-modern-element` cell wordings
// (classifyBatch).
const EMPTY_BATCH_ERROR_MESSAGE = 'Bad Request: empty JSON-RPC batch';
const BATCH_WITH_MODERN_ELEMENT_ERROR_MESSAGE =
  'Bad Request: JSON-RPC batches may not contain requests for protocol revision 2026-07-28 or later';

/**
 * Whether a single JSON-RPC message carries the per-request envelope claim
 * (the reserved protocol-version `_meta` key is present, regardless of value
 * well-formedness) — the SDK's `hasEnvelopeClaim` predicate, mirrored here
 * for the batch-element pre-scan.
 */
function hasEnvelopeClaim(element: unknown): boolean {
  const meta = getRequestParams(element)?._meta;
  return (
    meta !== undefined &&
    meta !== null &&
    typeof meta === 'object' &&
    !Array.isArray(meta) &&
    PROTOCOL_VERSION_META_KEY in (meta as Record<string, unknown>)
  );
}

function getUnsupportedProtocolVersionError(
  req: IncomingMessage,
  body: unknown
): UnsupportedVersionHttpError | null {
  const headerProtocolVersion = getSingleHeaderValue(
    req,
    'mcp-protocol-version'
  );
  // A 2025-era `initialize` names its version at `params.protocolVersion`
  // (the handshake itself carries no `_meta` envelope), so the body check
  // must read that top-level field too — otherwise a supported-version
  // initialize would be falsely rejected here before the transport's own
  // version negotiation answers it properly.
  const bodyProtocolVersion =
    extractBodyProtocolVersion(body) ?? extractInitializeProtocolVersion(body);
  const requestedProtocolVersion = headerProtocolVersion ?? bodyProtocolVersion;

  if (!requestedProtocolVersion) {
    return null;
  }
  if (MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(requestedProtocolVersion)) {
    return null;
  }

  const error = new UnsupportedProtocolVersionError({
    requested: requestedProtocolVersion,
    supported: [...MCP_SUPPORTED_PROTOCOL_VERSIONS],
  });

  return {
    statusCode: 400,
    requestId: extractRequestId(body),
    error: {
      code: error.code,
      message: error.message,
      data: error.data,
    },
  };
}

function buildHeaderMismatchError(
  requestId: string | number | null,
  data?: unknown
): MetadataValidationHttpError {
  return buildMetadataValidationError(
    requestId,
    HEADER_MISMATCH_ERROR_CODE,
    buildHeaderMismatchMessage(data),
    data
  );
}

/**
 * Renders the SDK's cross-check-mismatch wording ("the request headers and
 * body disagree: <reason>") from the mismatch descriptor, keeping every
 * rejection self-explanatory without callers repeating boilerplate.
 *
 * The generic fallthrough renders header names exactly as sent on the wire
 * (`mcp-protocol-version` — node:http lowercases them), but the origin/main
 * message set capitalized the header names (`MCP-Protocol-Version`,
 * `Mcp-Method`, `Mcp-Name`); the well-known presence errors restore that
 * capitalization so existing log-greps and tests keep matching.
 */
function buildHeaderMismatchMessage(data: unknown): string {
  const mismatch =
    data && typeof data === 'object'
      ? (data as { mismatch?: Record<string, unknown> }).mismatch
      : undefined;
  const entries = Object.entries(mismatch ?? {});
  if (entries.length === 0) {
    // Presence errors name the absent header/field directly.
    if (data && typeof data === 'object' && 'header' in data) {
      const header = (data as { header: string }).header;
      return `Missing required ${HEADER_DISPLAY_NAMES[header] ?? header} header.`;
    }
    if (data && typeof data === 'object' && 'field' in data) {
      return `Missing required ${(data as { field: string }).field} in request body.`;
    }
    return 'Bad Request: the request headers and body disagree.';
  }
  const [key, value] = entries[0];
  return `Bad Request: the request headers and body disagree: ${key} ${value}`;
}

// Wire-case spellings of the well-known metadata headers, used in the
// -32020 presence messages (origin/main parity).
const HEADER_DISPLAY_NAMES: Record<string, string> = {
  'mcp-protocol-version': 'MCP-Protocol-Version',
  'mcp-method': 'Mcp-Method',
  'mcp-name': 'Mcp-Name',
};

function buildMetadataValidationError(
  requestId: string | number | null,
  code:
    | typeof HEADER_MISMATCH_ERROR_CODE
    | typeof INVALID_PARAMS_ERROR_CODE
    | typeof INVALID_REQUEST_ERROR_CODE,
  message: string,
  data?: unknown
): MetadataValidationHttpError {
  return {
    statusCode: 400,
    requestId,
    error: {
      code,
      message,
      data,
    },
  };
}

function getSingleHeaderValue(
  req: IncomingMessage,
  headerName: string
): string | undefined {
  const raw = req.headers[headerName];
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw) && raw.length > 0) {
    return raw[0];
  }
  return undefined;
}

function extractBodyMethod(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const method = (body as Record<string, unknown>).method;
  return typeof method === 'string' ? method : undefined;
}

/**
 * The body value the `Mcp-Name` header mirrors for `method` (`params.name`
 * or `params.uri` per SEP-2243), when it is a string.
 */
function extractBodyName(method: string, body: unknown): string | undefined {
  const params = getRequestParams(body);
  const sourceField = MCP_NAME_HEADER_SOURCE[method];
  if (!params || sourceField === undefined) {
    return undefined;
  }
  const name = (params as Record<string, unknown>)[sourceField];
  return typeof name === 'string' ? name : undefined;
}

function getRequestParams(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const params = (body as Record<string, unknown>).params;
  return params && typeof params === 'object' && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : undefined;
}

function isJsonRpcNotification(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).method === 'string' &&
    !('id' in (body as Record<string, unknown>))
  );
}

/**
 * The -32602 shape of the SDK's `envelope-invalid` cell: a `_meta` envelope
 * that is present (the claim key exists) but violates the 2026-07-28
 * envelope schema. The message and `data.envelope` issue mirror the SDK's
 * wording (`Invalid _meta envelope for protocol revision 2026-07-28:
 * <key>: <problem>`), reporting the FIRST issue in the SDK's stable order:
 * missing required keys first (`problem: 'missing'`, in
 * `REQUIRED_ENVELOPE_KEYS` order), then schema violations inside present
 * keys.
 *
 * The SDK requires `io.modelcontextprotocol/clientCapabilities` (a present
 * object) alongside the claim key on every claimed request — verified live
 * against `classifyInboundRequest`/`validateEnvelopeMeta`. This closes the
 * claim-only-modern acceptance gap: a modern-era claim without the
 * capabilities key is an invalid envelope, never silently served. The only
 * schema details checked here are the two required keys' presence/types —
 * deeper capability-shape validation stays with the SDK (frodo forwards the
 * request body untouched once this gate passes; the SDK's dispatch re-runs
 * its own envelope check on the modern path).
 */
function buildEnvelopeInvalidError(
  envelopeClaim: {
    hasClaim: boolean;
    version: string | undefined;
    receivedType: string | undefined;
    meta: Record<string, unknown> | undefined;
  },
  requestId: string | number | null
): MetadataValidationHttpError | null {
  if (!envelopeClaim.hasClaim) {
    return null;
  }
  const issue = firstEnvelopeIssue(envelopeClaim.meta, envelopeClaim.version);
  if (!issue) {
    return null;
  }
  return buildMetadataValidationError(
    requestId,
    INVALID_PARAMS_ERROR_CODE,
    `Invalid _meta envelope for protocol revision ${FIRST_MODERN_PROTOCOL_VERSION}: ` +
      `${issue.key}: ${issue.problem}`,
    { envelope: { key: issue.key, problem: issue.problem } }
  );
}

/**
 * The notification-path twin of {@linkcode buildEnvelopeInvalidError},
 * mirroring the SDK's `notification-envelope-invalid` cell exactly: the
 * claim key's OWN issue is reported — `.find(key ===
 * PROTOCOL_VERSION_META_KEY)` in the SDK — and nothing else. A claimed
 * notification with a non-string claim value is the one rejected shape
 * (-32602, the claim key's type error); a valid string claim requires no
 * capabilities key and is never rejected here (the SDK serves claimed
 * notifications with no capabilities key at all — verified live).
 */
function buildNotificationEnvelopeInvalidError(
  envelopeClaim: {
    hasClaim: boolean;
    version: string | undefined;
    receivedType: string | undefined;
    meta: Record<string, unknown> | undefined;
  },
  requestId: string | number | null
): MetadataValidationHttpError | null {
  if (!envelopeClaim.hasClaim || envelopeClaim.version !== undefined) {
    return null;
  }
  const problem = `Invalid input: expected string, received ${envelopeClaim.receivedType}`;
  return buildMetadataValidationError(
    requestId,
    INVALID_PARAMS_ERROR_CODE,
    `Invalid _meta envelope for protocol revision ${FIRST_MODERN_PROTOCOL_VERSION}: ` +
      `${PROTOCOL_VERSION_META_KEY}: ${problem}`,
    {
      envelope: { key: PROTOCOL_VERSION_META_KEY, problem },
    }
  );
}

type EnvelopeIssue = { key: string; problem: string };

/**
 * The first `validateEnvelopeMeta` issue for a claimed `_meta` object, in
 * the SDK's stable order (verified live): MISSING required keys first — the
 * reserved protocol-version key, then the client-capabilities key — and only
 * then schema violations inside present keys. Null when the envelope is
 * well-formed.
 */
function firstEnvelopeIssue(
  meta: Record<string, unknown> | undefined,
  version: string | undefined
): EnvelopeIssue | null {
  if (!meta) {
    return null;
  }
  // Missing keys first (SDK `validateEnvelopeMeta` order): the claim key,
  // then the capabilities key. A non-string claim value is a schema
  // violation of a PRESENT key, so it only surfaces after the capabilities
  // key's own missing check — the SDK answers a claimed `_meta` carrying a
  // number revision and no capabilities key with
  // `clientCapabilities: missing`, not the claim's type error (verified
  // live: validateEnvelopeMeta({protocolVersion: 12345}) returns
  // [clientCapabilities: missing, protocolVersion: type-error] and
  // classifyInboundRequest reports the FIRST issue).
  if (!(PROTOCOL_VERSION_META_KEY in meta)) {
    return { key: PROTOCOL_VERSION_META_KEY, problem: 'missing' };
  }
  if (!(CLIENT_CAPABILITIES_META_KEY in meta)) {
    return { key: CLIENT_CAPABILITIES_META_KEY, problem: 'missing' };
  }
  if (version === undefined) {
    return {
      key: PROTOCOL_VERSION_META_KEY,
      problem: `Invalid input: expected string, received ${describeJsonType(meta[PROTOCOL_VERSION_META_KEY])}`,
    };
  }
  // Present-but-non-object capabilities are schema violations (zod wording).
  const caps = meta[CLIENT_CAPABILITIES_META_KEY];
  if (caps === null || typeof caps !== 'object' || Array.isArray(caps)) {
    return {
      key: CLIENT_CAPABILITIES_META_KEY,
      problem: `Invalid input: expected object, received ${describeJsonType(caps)}`,
    };
  }
  return null;
}

/**
 * The per-request envelope claim carried in the body's `params._meta`: a
 * request claims the envelope mechanism by having the reserved
 * protocol-version key present, regardless of value well-formedness (SDK
 * `hasEnvelopeClaim` parity — a malformed claim is a validation error, never
 * a silent fallback to legacy handling).
 *
 * `version` is the claim value when it is a string; `receivedType` carries
 * the JSON type name of a non-string claim value (mirroring zod's
 * `received <type>` wording) so the malformed-claim rejection can render the
 * SDK's exact `envelope-invalid` problem text; `meta` is the claimed
 * `_meta` object itself for full envelope-shape validation.
 */
function extractEnvelopeClaim(body: unknown): {
  hasClaim: boolean;
  version: string | undefined;
  receivedType: string | undefined;
  meta: Record<string, unknown> | undefined;
} {
  const params = getRequestParams(body);
  const meta = params?._meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return {
      hasClaim: false,
      version: undefined,
      receivedType: undefined,
      meta: undefined,
    };
  }
  const metaObject = meta as Record<string, unknown>;
  const hasClaim = PROTOCOL_VERSION_META_KEY in metaObject;
  const raw = metaObject[PROTOCOL_VERSION_META_KEY];
  return {
    hasClaim,
    version: typeof raw === 'string' ? raw : undefined,
    // A present non-string claim is the only case that ever reaches the
    // malformed-claim rejection, so this type name is only rendered there.
    receivedType: typeof raw === 'string' ? undefined : describeJsonType(raw),
    meta: metaObject,
  };
}

/** JSON value's type name, in zod's `expected string, received <type>` wording. */
function describeJsonType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function isModernProtocolVersion(version: string | undefined): boolean {
  return version !== undefined && version >= FIRST_MODERN_PROTOCOL_VERSION;
}

/**
 * Whether the envelope claim is both well-formed (a string revision) AND
 * names a modern revision AND the full envelope passes shape validation —
 * the SDK's `carriesValidModernEnvelopeClaim` predicate. Only such a claim
 * overrides the `initialize` ⇒ legacy-handshake rule; a claim missing the
 * client-capabilities key is invalid and never overrides.
 */
function carriesValidModernEnvelopeClaim(envelopeClaim: {
  hasClaim: boolean;
  version: string | undefined;
  meta: Record<string, unknown> | undefined;
}): boolean {
  if (
    !envelopeClaim.hasClaim ||
    !isModernProtocolVersion(envelopeClaim.version)
  ) {
    return false;
  }
  return firstEnvelopeIssue(envelopeClaim.meta, envelopeClaim.version) === null;
}

/**
 * The protocol version named by a 2025-era `initialize` handshake at
 * `params.protocolVersion`.
 */
function extractInitializeProtocolVersion(body: unknown): string | undefined {
  const protocolVersion = getRequestParams(body)?.protocolVersion;
  return typeof protocolVersion === 'string' ? protocolVersion : undefined;
}

function extractBodyProtocolVersion(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  const bodyObject = body as Record<string, unknown>;
  const params =
    bodyObject.params && typeof bodyObject.params === 'object'
      ? (bodyObject.params as Record<string, unknown>)
      : undefined;
  const meta =
    params?._meta && typeof params._meta === 'object'
      ? (params._meta as Record<string, unknown>)
      : undefined;
  if (!meta) {
    return undefined;
  }

  const protocolVersion = meta[PROTOCOL_VERSION_META_KEY];
  return typeof protocolVersion === 'string' ? protocolVersion : undefined;
}

function extractRequestId(body: unknown): string | number | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const requestId = (body as Record<string, unknown>).id;
  if (typeof requestId === 'string' || typeof requestId === 'number') {
    return requestId;
  }
  if (requestId === null) {
    return null;
  }

  return null;
}

function writeJsonRpcErrorResponse(
  res: ServerResponse,
  statusCode: number,
  payload: {
    jsonrpc: '2.0';
    id: string | number | null;
    error: {
      code: number;
      message: string;
      data?: unknown;
    };
  },
  extraHeaders?: Record<string, string>
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  res.end(safeJsonStringify(payload));
}

/**
 * Builds a standardized error result for tool execution failures.
 * Extracts full error context from FrodoError chains and HTTP error details.
 */
function buildSuccessResult(result: unknown): {
  content: { type: 'text'; text: string }[];
} {
  const serialized = safeJsonStringify(result);
  const payloadSizeBytes = Buffer.byteLength(serialized, 'utf8');
  const inlineLimitBytes = getInlineResultLimitBytes(result);
  if (payloadSizeBytes <= inlineLimitBytes) {
    return {
      content: [
        {
          type: 'text' as const,
          text: serialized,
        },
      ],
    };
  }

  const truncatedPayload = buildTruncatedSuccessPayload(
    result,
    payloadSizeBytes
  );
  return {
    content: [
      {
        type: 'text' as const,
        text: safeJsonStringify(truncatedPayload),
      },
    ],
  };
}

/**
 * Returns the inline payload-size limit for a given MCP tool result.
 * Discovery payloads are intentionally allowed to be larger so agents can
 * inspect full operation contracts without losing fields to transport truncation.
 */
function getInlineResultLimitBytes(result: unknown): number {
  const data =
    result && typeof result === 'object'
      ? (result as { data?: unknown }).data
      : undefined;
  if (
    result &&
    typeof result === 'object' &&
    (result as Record<string, unknown>).toolName === 'frodo_discover' &&
    data &&
    typeof data === 'object' &&
    'operationDetailsByType' in data
  ) {
    return MAX_INLINE_DISCOVERY_RESULT_BYTES;
  }
  return MAX_INLINE_RESULT_BYTES;
}

/**
 * Replaces oversized inline payloads with a summary/truncation envelope.
 */
function buildTruncatedSuccessPayload(
  result: unknown,
  payloadSizeBytes: number
): unknown {
  const warning =
    'Result exceeded the inline response limit. Narrow the request using scope, deps=false, paging, or a more specific read/export.';
  const resultObject =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : { data: result };
  const metadataObject =
    resultObject.metadata && typeof resultObject.metadata === 'object'
      ? (resultObject.metadata as Record<string, unknown>)
      : {};
  const existingResultMetadata =
    metadataObject.result && typeof metadataObject.result === 'object'
      ? (metadataObject.result as Record<string, unknown>)
      : {};

  return {
    ...resultObject,
    data: {
      _truncated: true,
      message: warning,
    },
    metadata: {
      ...metadataObject,
      result: {
        ...existingResultMetadata,
        payloadSizeBytes,
        payloadSizeHuman: formatByteSize(payloadSizeBytes),
        isLarge: true,
        isTruncated: true,
        warning,
      },
    },
  };
}

/**
 * Safely stringifies a payload for MCP transport output.
 */
function safeJsonStringify(payload: unknown): string {
  try {
    return JSON.stringify(payload, null, 2) ?? 'null';
  } catch {
    return JSON.stringify(String(payload), null, 2);
  }
}

/**
 * Formats byte counts for human-readable MCP payload metadata.
 */
function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function buildErrorResult(err: unknown): {
  content: { type: 'text'; text: string }[];
  isError: true;
} {
  let errorText = 'Error: ';

  if (err instanceof Error) {
    // If it's a FrodoError with nested originalErrors, get combined message
    if (typeof (err as any).getCombinedMessage === 'function') {
      errorText += (err as any).getCombinedMessage();
    } else if (
      (err as any).originalErrors &&
      Array.isArray((err as any).originalErrors)
    ) {
      // Fallback: manually build chain for non-getCombinedMessage errors
      errorText += err.message;
      const originalErrors = (err as any).originalErrors as Error[];
      for (const nested of originalErrors) {
        errorText += `\n  → ${nested.name || 'Error'}: ${nested.message}`;
      }
    } else {
      errorText += err.message;
    }
  } else {
    errorText += String(err);
  }

  // A browser-login session's credential expired with no unattended
  // refresh path (see BaseApi.ts's throwCannotSilentlyRefresh(), which sets
  // this flag) — an MCP server process can't complete a fresh interactive
  // browser round trip on its own, so this is terminal for the rest of the
  // process's life, not just this one call. Every further AM/IDM-touching
  // tool call will hit the same underlying cause, so surfacing this note on
  // every subsequent error (not just the first) is accurate, not noisy.
  if (state.getNeedsReauthentication()) {
    errorText +=
      '\n\nThis MCP server session needs re-authentication and cannot silently refresh itself. Restart the server after completing a fresh interactive login (e.g. `frodo login --browser`).';
  }

  return {
    content: [
      {
        type: 'text' as const,
        text: errorText,
      },
    ],
    isError: true as const,
  };
}

type FrodoInstance = ReturnType<typeof resolveRequestScopedFrodo>;

/**
 * Resolves the Frodo instance to use for one MCP request.
 *
 * @remarks
 * `frodo mcp server start` authenticates one `Frodo` singleton at startup
 * and reuses it for every request, to avoid a redundant re-authentication
 * round trip on every tool call. But a dispatch call's `realm` argument is
 * meant to scope just that one call (see `applyDispatchScopeOverride` in
 * frodo-lib's `ToolRuntime.ts`) — handing back the shared singleton
 * unconditionally would silently ignore it, since the singleton's own
 * realm was fixed once at startup and never changes. This falls back to a
 * genuinely realm-scoped instance (via {@link resolveRequestScopedFrodo})
 * only when `context` actually asks for a realm different from the
 * singleton's, and is otherwise a plain passthrough.
 *
 * Exported and pure (the singleton's realm is passed in rather than read
 * from the shared `state` singleton directly) so this realm-scoping
 * decision has direct unit test coverage — silently ignoring `context`
 * for every call is exactly the bug this guards against, and it was only
 * caught by live testing, not a type error.
 *
 * @param context Request-scoped runtime auth context (see
 * {@link buildRequestContext}).
 * @param frodoSingleton The server's pre-authenticated Frodo singleton.
 * @param singletonRealm The realm `frodoSingleton` is currently scoped to.
 * @returns `frodoSingleton` when no realm override applies, otherwise a
 * fresh instance scoped to the requested realm.
 */
export async function resolveFrodoForMcpRequest(
  context: McpRuntimeRequestContext,
  frodoSingleton: FrodoInstance,
  singletonRealm: string | undefined
): Promise<FrodoInstance> {
  const requestedRealm = getRealmFromContext(context);
  if (!requestedRealm || requestedRealm === singletonRealm) {
    return frodoSingleton;
  }
  return resolveRequestScopedFrodo(context, frodoSingleton);
}

/**
 * Builds request-scoped runtime auth context from active frodo state (or,
 * for the OAuth resource-server mode, from a caller-verified `authInfo`).
 * Exported for direct unit coverage of the bearer-token branch, matching
 * `verifyMcpBearerAuthorization`'s own rationale.
 */
export function buildRequestContext(
  realmOverride?: string,
  trace?: McpToolRuntimeTraceHandler,
  authInfo?: AuthInfo
): McpRuntimeRequestContext {
  const host = state.getHost();
  const realm = realmOverride ?? state.getRealm();
  const sharedContext = {
    requestId: crypto.randomUUID(),
    ...(trace && { trace }),
  };

  // Shared/OAuth-resource-server mode: this one request presented its own,
  // already-verified bearer token (verifyMcpOAuthBearerToken, called before
  // the transport ever saw this request) — it wins outright over every
  // ambient-state branch below, since in this mode the process itself never
  // logs in at all (no service account, no admin account, no browser
  // session — `host`/`deploymentType` are the only things configured on
  // `state`, for exactly this purpose).
  if (host && authInfo) {
    // External-IDP mode: the resource-server gate's resolveCredential hook
    // already mapped this request's claims to a specific additional
    // service account (buildClaimMappedCredentialResolver) — use that
    // instead of the caller's own (external, not AM-native) token, which
    // is never itself a usable AM credential in this mode.
    const resolvedServiceAccountId = authInfo.extra?.resolvedServiceAccountId as
      | string
      | undefined;
    const resolvedServiceAccountJwk = authInfo.extra?.resolvedServiceAccountJwk;
    if (resolvedServiceAccountId && resolvedServiceAccountJwk) {
      return {
        ...sharedContext,
        auth: {
          mode: 'service-account',
          host,
          serviceAccountId: resolvedServiceAccountId,
          serviceAccountJwk: JSON.stringify(resolvedServiceAccountJwk),
          realm,
          deploymentType: state.getDeploymentType(),
          allowInsecureConnection: state.getAllowInsecureConnection(),
          debug: state.getDebug(),
          curlirize: state.getCurlirize(),
        },
      };
    }
    return {
      ...sharedContext,
      auth: {
        mode: 'bearer-token',
        host,
        accessToken: authInfo.token,
        scope: authInfo.scopes?.join(' '),
        expiresAt: authInfo.expiresAt
          ? authInfo.expiresAt * 1000
          : undefined,
        sessionId: authInfo.extra?.sessionToken as string | undefined,
        realm,
        deploymentType: state.getDeploymentType(),
        allowInsecureConnection: state.getAllowInsecureConnection(),
        debug: state.getDebug(),
        curlirize: state.getCurlirize(),
      },
    };
  }

  const serviceAccountId = state.getServiceAccountId();
  const serviceAccountJwk = state.getServiceAccountJwk();
  if (host && serviceAccountId && serviceAccountJwk) {
    return {
      ...sharedContext,
      auth: {
        mode: 'service-account',
        host,
        serviceAccountId,
        serviceAccountJwk: JSON.stringify(serviceAccountJwk),
        realm,
        deploymentType: state.getDeploymentType(),
        allowInsecureConnection: state.getAllowInsecureConnection(),
        debug: state.getDebug(),
        curlirize: state.getCurlirize(),
      },
    };
  }

  const username = state.getUsername();
  const password = state.getPassword();
  if (host && username && password) {
    return {
      ...sharedContext,
      auth: {
        mode: 'admin-account',
        host,
        username,
        password,
        realm,
        deploymentType: state.getDeploymentType(),
        allowInsecureConnection: state.getAllowInsecureConnection(),
        debug: state.getDebug(),
        curlirize: state.getCurlirize(),
      },
    };
  }

  // The server's own singleton was already authenticated via
  // getTokensInteractive() at startup (see server-start.ts) for the common
  // case — this branch only matters for the rarer per-call realm override
  // that forces a *new* scoped instance (resolveFrodoForMcpRequest), which
  // still needs a real browser-login auth context (not the state-config
  // fallback below) so the runtime's browserLoginPromptHandler gets used.
  if (host && state.getAuthMode() === 'interactive') {
    return {
      ...sharedContext,
      auth: {
        mode: 'browser',
        host,
        realm,
        deploymentType: state.getDeploymentType(),
        loginClientId: state.getBrowserLoginClientId(),
        loginScope: state.getBrowserLoginScope(),
        loginRedirectUri: state.getAdminClientRedirectUri(),
        useDeviceFlow: getUseDeviceFlow(),
        allowInsecureConnection: state.getAllowInsecureConnection(),
        debug: state.getDebug(),
        curlirize: state.getCurlirize(),
      },
    };
  }

  return {
    ...sharedContext,
    auth: {
      mode: 'state-config',
      config: {
        ...state.getState(),
        realm,
      },
    },
  };
}

function buildTraceHandler(
  ctx: unknown,
  logger?: McpLogger
): McpToolRuntimeTraceHandler | undefined {
  if (
    !logger ||
    logger.level === 'off' ||
    !ctx ||
    typeof ctx !== 'object' ||
    !('mcpReq' in ctx) ||
    !ctx.mcpReq ||
    typeof ctx.mcpReq !== 'object' ||
    !('notify' in ctx.mcpReq) ||
    typeof ctx.mcpReq.notify !== 'function'
  ) {
    return undefined;
  }

  const notify = ctx.mcpReq.notify.bind(ctx.mcpReq) as (notification: {
    method: 'notifications/message';
    params: {
      level: McpProtocolLogLevel;
      data: unknown;
      logger: string;
    };
  }) => Promise<void>;

  return (event) => {
    logger.trace(event, ({ level, data }) => {
      return notify({
        method: 'notifications/message',
        params: { level, data, logger: 'frodo-cli' },
      }).catch(() => undefined);
    });
  };
}
