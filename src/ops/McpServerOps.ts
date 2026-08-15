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

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';

import {
  localhostHostValidation,
  localhostOriginValidation,
  NodeStreamableHTTPServerTransport,
} from '@modelcontextprotocol/node';
import {
  McpServer,
  PROTOCOL_VERSION_META_KEY,
  ToolAnnotations,
  UnsupportedProtocolVersionError,
} from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import {
  type McpRuntimeRequestContext,
  type McpService,
  type McpToolRuntimeTraceHandler,
  state,
} from '@rockcarver/frodo-lib';
import { z } from 'zod';

import { printMessage } from '../utils/Console.js';
import { McpLogger, type McpProtocolLogLevel } from './McpLogger.js';
import {
  MCP_SERVER_DISCOVERY_INSTRUCTIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  MCP_SUPPORTED_PROTOCOL_VERSIONS,
} from './McpServerMetadata.js';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

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
                buildTraceHandler(ctx, startupInfo?.logger)
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
                buildTraceHandler(ctx, startupInfo?.logger)
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
                buildTraceHandler(ctx, startupInfo?.logger)
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
                buildTraceHandler(ctx, startupInfo?.logger)
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
                buildTraceHandler(ctx, startupInfo?.logger)
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
  serveStdio(() => buildMcpServer(service, startupInfo));
}

/**
 * Starts a stateless MCP HTTP server using the Streamable HTTP transport.
 *
 * The MCP endpoint is `POST /mcp`. A `GET /health` endpoint is provided for
 * liveness probing. Host and origin are validated for localhost safety.
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
  port: number,
  startupInfo?: McpServerStartupInfo
): Promise<void> {
  const mcpServer = buildMcpServer(service, startupInfo);
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await mcpServer.connect(transport);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      try {
        await handleHttpRequest(
          req,
          res,
          transport,
          validateHost,
          validateOrigin
        );
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
  transport: NodeStreamableHTTPServerTransport,
  validateHost: (req: IncomingMessage, res: ServerResponse) => boolean,
  validateOrigin: (req: IncomingMessage, res: ServerResponse) => boolean
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

  if (!validateHost(req, res) || !validateOrigin(req, res)) {
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

  const metadataValidationError = validateHttpRequestMetadata(req, body);
  if (metadataValidationError) {
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

/**
 * Validates required MCP request metadata headers against request-body values.
 *
 * Returns a spec-aligned HeaderMismatch (-32020) error when required headers
 * are missing or disagree with body metadata.
 */
export function validateHttpRequestMetadata(
  req: IncomingMessage,
  body: unknown
): HeaderMismatchHttpError | null {
  const requestId = extractRequestId(body);
  const headerProtocolVersion = getSingleHeaderValue(
    req,
    'mcp-protocol-version'
  );
  const bodyProtocolVersion = extractBodyProtocolVersion(body);

  if (!headerProtocolVersion) {
    return buildHeaderMismatchError(
      requestId,
      'Missing required MCP-Protocol-Version header.',
      { header: 'mcp-protocol-version' }
    );
  }
  if (!bodyProtocolVersion) {
    return buildHeaderMismatchError(
      requestId,
      'Missing required _meta protocol version in request body.',
      { field: '_meta.protocolVersion' }
    );
  }
  if (headerProtocolVersion !== bodyProtocolVersion) {
    return buildHeaderMismatchError(
      requestId,
      'MCP-Protocol-Version header does not match request body metadata.',
      {
        headerProtocolVersion,
        bodyProtocolVersion,
      }
    );
  }

  const headerMethod = getSingleHeaderValue(req, 'mcp-method');
  const bodyMethod = extractBodyMethod(body);
  if (!headerMethod) {
    return buildHeaderMismatchError(
      requestId,
      'Missing required Mcp-Method header.',
      { header: 'mcp-method' }
    );
  }
  if (!bodyMethod) {
    return buildHeaderMismatchError(
      requestId,
      'Missing request method in JSON-RPC body.',
      { field: 'method' }
    );
  }
  if (headerMethod !== bodyMethod) {
    return buildHeaderMismatchError(
      requestId,
      'Mcp-Method header does not match JSON-RPC method.',
      {
        headerMethod,
        bodyMethod,
      }
    );
  }

  if (methodRequiresMcpName(bodyMethod)) {
    const headerName = getSingleHeaderValue(req, 'mcp-name');
    const bodyName = extractBodyName(body);
    if (!headerName) {
      return buildHeaderMismatchError(
        requestId,
        `Missing required Mcp-Name header for method '${bodyMethod}'.`,
        { header: 'mcp-name', method: bodyMethod }
      );
    }
    if (!bodyName) {
      return buildHeaderMismatchError(
        requestId,
        `Missing request name in JSON-RPC params for method '${bodyMethod}'.`,
        { field: 'params.name', method: bodyMethod }
      );
    }
    if (headerName !== bodyName) {
      return buildHeaderMismatchError(
        requestId,
        'Mcp-Name header does not match request params.name.',
        {
          headerName,
          bodyName,
          method: bodyMethod,
        }
      );
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

type HeaderMismatchHttpError = {
  statusCode: 400;
  requestId: string | number | null;
  error: {
    code: -32020;
    message: string;
    data?: unknown;
  };
};

const HEADER_MISMATCH_ERROR_CODE = -32020 as const;

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
  message: string,
  data?: unknown
): HeaderMismatchHttpError {
  return {
    statusCode: 400,
    requestId,
    error: {
      code: HEADER_MISMATCH_ERROR_CODE,
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

function extractBodyName(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const params = (body as Record<string, unknown>).params;
  if (!params || typeof params !== 'object') {
    return undefined;
  }
  const name = (params as Record<string, unknown>).name;
  return typeof name === 'string' ? name : undefined;
}

function methodRequiresMcpName(method: string): boolean {
  return (
    method === 'tools/call' ||
    method === 'resources/read' ||
    method === 'prompts/get'
  );
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
function buildRequestContext(
  realmOverride?: string,
  trace?: McpToolRuntimeTraceHandler
): McpRuntimeRequestContext {
  const host = state.getHost();
  const realm = realmOverride ?? state.getRealm();
  const sharedContext = {
    requestId: crypto.randomUUID(),
    ...(trace && { trace }),
  };

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
