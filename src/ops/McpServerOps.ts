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
 * HTTP transport   — multi-session stateful server using StreamableHTTP.
 *                    Each initialize request creates a new MCP session.
 *                    Sessions are cleaned up when the client disconnects.
 *                    The same McpServer instance is reused across sessions.
 *
 * @remarks
 * Both transports derive request-scoped auth context from the active shared
 * state configured by `handleDefaultArgsAndOpts` before startup. Generic tool
 * calls may additionally override realm per request.
 */

import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import {
  isInitializeRequest,
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  SUPPORTED_PROTOCOL_VERSIONS,
  ToolAnnotations,
  UnsupportedProtocolVersionError,
} from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import {
  type McpRuntimeRequestContext,
  type McpService,
  state,
} from '@rockcarver/frodo-lib';
import { z } from 'zod';

import { printMessage } from '../utils/Console.js';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

// Zod v4 schema shapes reused for canonical hybrid and special tools.
const MAX_INLINE_RESULT_BYTES = 256 * 1024;
const MAX_INLINE_DISCOVERY_RESULT_BYTES = 2 * 1024 * 1024;
const MCP_SERVER_DISCOVERY_INSTRUCTIONS =
  'Frodo MCP server exposes a tools-first capability surface. Call frodo_discover for detailed domain/object operation contracts before invoking mutating tools.';

const FIND_CAPABILITIES_SHAPE = {
  query: z
    .string()
    .optional()
    .describe(
      'Free-text query across capability id, domain, object type, method, and notes.'
    ),
  domain: z.string().optional().describe('Optional domain filter.'),
  objectType: z.string().optional().describe('Optional object type filter.'),
  capabilityIdPrefix: z
    .string()
    .optional()
    .describe('Optional capability id prefix filter.'),
  operationTypes: z
    .array(z.string())
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
    .describe('Optional maximum number of returned capabilities.'),
} as const;

const DESCRIBE_CAPABILITY_SHAPE = {
  capabilityId: z
    .string()
    .describe('Capability id returned by frodo_find_capabilities.'),
} as const;

const DISPATCH_SHAPE = {
  capabilityId: z
    .string()
    .optional()
    .describe('Direct capability id selector (preferred).'),
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
export function buildMcpServer(service: McpService): McpServer {
  const server = new McpServer(
    { name: 'frodo-mcp', version: '1.0.0' },
    { instructions: MCP_SERVER_DISCOVERY_INSTRUCTIONS }
  );

  for (const tool of service.listTools()) {
    const isDiscovery = tool.name === 'frodo_discover';
    const isFindCapabilities = tool.name === 'frodo_find_capabilities';
    const isDescribeCapability = tool.name === 'frodo_describe_capability';
    const isDispatchTool =
      tool.name === 'frodo_dispatch' ||
      tool.name === 'frodo_dispatch_read_only';
    const annotations: ToolAnnotations | undefined = tool.annotations
      ? { ...tool.annotations }
      : undefined;

    if (isDiscovery) {
      server.registerTool(
        tool.name,
        { description: tool.description },
        async () => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              context: buildRequestContext(),
            });
            return buildSuccessResult(result);
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    } else if (isFindCapabilities) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: FIND_CAPABILITIES_SHAPE,
          annotations,
        },
        async (args) => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(),
            });
            return buildSuccessResult(result);
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    } else if (isDescribeCapability) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: DESCRIBE_CAPABILITY_SHAPE,
          annotations,
        },
        async (args) => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(),
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
        async (args) => {
          try {
            const realm =
              args && typeof args === 'object'
                ? ((args as { realm?: unknown }).realm as string | undefined)
                : undefined;
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(realm),
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
        async (args) => {
          try {
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(),
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
export async function startStdioTransport(service: McpService): Promise<void> {
  const server = buildMcpServer(service);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // server.connect() resolves once stdin closes
}

/**
 * Starts a stateful MCP HTTP server using the Streamable HTTP transport.
 *
 * Each `POST /mcp` initialize request creates a new session.
 * Sessions are removed when the client sends `DELETE /mcp` or disconnects.
 * A `GET /health` endpoint is provided for liveness probing.
 *
 * The function resolves when the server is stopped via SIGTERM or SIGINT.
 *
 * @param service Fully composed MCP service.
 * @param bindHost Host interface to bind (e.g. `"127.0.0.1"`).
 * @param port TCP port to listen on.
 */
export async function startHttpTransport(
  service: McpService,
  bindHost: string,
  port: number
): Promise<void> {
  const mcpServer = buildMcpServer(service);
  const sessions = new Map<string, NodeStreamableHTTPServerTransport>();

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        await handleHttpRequest(req, res, mcpServer, sessions);
      } catch (err) {
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

  return new Promise<void>((resolve, reject) => {
    httpServer.listen(port, bindHost, () => {
      printMessage(
        `MCP HTTP server listening on http://${bindHost}:${port}/mcp`,
        'info'
      );
    });

    httpServer.on('error', (err) => {
      printMessage(`MCP HTTP server error: ${err.message}`, 'error');
      reject(err);
    });

    const shutdown = () => {
      httpServer.close(() => resolve());
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Routes a single HTTP request to the appropriate MCP transport handler.
 */
async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  mcpServer: McpServer,
  sessions: Map<string, NodeStreamableHTTPServerTransport>
): Promise<void> {
  // Health probe
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.url !== '/mcp') {
    res.writeHead(404).end('Not found');
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Retrieve existing session for GET / DELETE
  if (req.method === 'GET' || req.method === 'DELETE') {
    if (!sessionId || !sessions.has(sessionId)) {
      res.writeHead(400).end('Invalid or missing session ID');
      return;
    }
    await sessions.get(sessionId)!.handleRequest(req, res);
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405).end('Method not allowed');
    return;
  }

  // Parse body for POST
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    res.writeHead(400).end('Invalid JSON body');
    return;
  }

  // Enforce dual Accept header (MCP spec requirement)
  const accept = (req.headers['accept'] ?? '').toLowerCase();
  if (
    !accept.includes('application/json') ||
    !accept.includes('text/event-stream')
  ) {
    res
      .writeHead(406)
      .end(
        'Not Acceptable: Client must accept both application/json and text/event-stream'
      );
    return;
  }

  const protocolVersionError = getUnsupportedProtocolVersionError(req, body);
  if (protocolVersionError) {
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

  let transport: NodeStreamableHTTPServerTransport;

  if (sessionId && sessions.has(sessionId)) {
    transport = sessions.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(body)) {
    transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, transport);
      },
      enableDnsRebindingProtection: false,
    });
    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };
    await mcpServer.connect(transport);
  } else {
    res.writeHead(400).end('Bad Request: No valid session ID provided');
    return;
  }

  await transport.handleRequest(req, res, body);
}

/**
 * Reads and parses the JSON body from an incoming HTTP request.
 */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
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

function getUnsupportedProtocolVersionError(
  req: IncomingMessage,
  body: unknown
): UnsupportedVersionHttpError | null {
  const headerProtocolVersion =
    typeof req.headers['mcp-protocol-version'] === 'string'
      ? req.headers['mcp-protocol-version']
      : undefined;
  const bodyProtocolVersion = extractBodyProtocolVersion(body);
  const requestedProtocolVersion = headerProtocolVersion ?? bodyProtocolVersion;

  if (!requestedProtocolVersion) {
    return null;
  }
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(requestedProtocolVersion)) {
    return null;
  }

  const error = new UnsupportedProtocolVersionError({
    requested: requestedProtocolVersion,
    supported: [...SUPPORTED_PROTOCOL_VERSIONS],
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
  }
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
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
  if (
    result &&
    typeof result === 'object' &&
    (result as Record<string, unknown>).toolName === 'frodo_discover'
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

/**
 * Builds request-scoped runtime auth context from active frodo state.
 */
function buildRequestContext(realmOverride?: string): McpRuntimeRequestContext {
  const host = state.getHost();
  const realm = realmOverride ?? state.getRealm();

  const serviceAccountId = state.getServiceAccountId();
  const serviceAccountJwk = state.getServiceAccountJwk();
  if (host && serviceAccountId && serviceAccountJwk) {
    return {
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

  return {
    auth: {
      mode: 'state-config',
      config: {
        ...state.getState(),
        realm,
      },
    },
  };
}
