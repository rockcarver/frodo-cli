/**
 * MCP transport wiring for `frodo mcp server start`.
 *
 * This module is transport-specific: it bridges the transport-agnostic
 * {@link McpService} from frodo-lib with the `@modelcontextprotocol/sdk`
 * transports (stdio and HTTP).
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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  type McpGenericExecutionArguments,
  type McpRuntimeRequestContext,
  type McpService,
  state,
} from '@rockcarver/frodo-lib';
import { z } from 'zod';

import { printMessage } from '../utils/Console.js';

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

// Zod v4 schema shapes reused for generic and special tools.
const GENERIC_SHAPE = {
  domain: z.string().describe('Top-level capability domain key (e.g. "authn")'),
  objectType: z
    .string()
    .describe(
      'Object type within the domain (e.g. "Journey"). Use frodo_discover to enumerate available types.'
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
function buildMcpServer(service: McpService): McpServer {
  const server = new McpServer({ name: 'frodo-mcp', version: '1.0.0' });
  const { manifest } = service;

  for (const tool of service.listTools()) {
    const isDiscovery = tool.name === manifest.discoveryTool.toolName;
    const isGeneric = manifest.genericTools.some(
      (t) => t.toolName === tool.name
    );
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
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (err) {
            return buildErrorResult(err);
          }
        }
      );
    } else if (isGeneric) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: GENERIC_SHAPE,
          annotations,
        },
        async (args) => {
          try {
            const genericArgs = args as McpGenericExecutionArguments;
            const result = await service.executeTool({
              toolName: tool.name,
              arguments: args,
              context: buildRequestContext(genericArgs.realm),
            });
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
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
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
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
  const sessions = new Map<string, StreamableHTTPServerTransport>();

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
  sessions: Map<string, StreamableHTTPServerTransport>
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

  let transport: StreamableHTTPServerTransport;

  if (sessionId && sessions.has(sessionId)) {
    transport = sessions.get(sessionId)!;
  } else if (!sessionId && isInitializeRequest(body)) {
    transport = new StreamableHTTPServerTransport({
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

/**
 * Builds a standardized error result for tool execution failures.
 * Extracts full error context from FrodoError chains and HTTP error details.
 */
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
