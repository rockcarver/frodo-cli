import { createMcpService, frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';

import {
  startHttpTransport,
  startStdioTransport,
} from '../../../ops/McpServerOps.js';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';

type McpPolicyPreset = 'read-only' | 'standard' | 'admin';

/** Parsed options for `frodo mcp server start`. */
type McpStartOptions = {
  /** Policy preset controlling capability exposure. */
  policy: McpPolicyPreset;
  /** Optional allow-list of top-level capability domains. */
  includeDomains?: string[];
  /** Optional deny-list of top-level capability domains. */
  excludeDomains?: string[];
  /** Whether to include the `utils` top-level domain. */
  includeUtils?: boolean;
  /** Transport mode to launch. */
  transport?: 'stdio' | 'http';
  /** Bind host for HTTP transport. */
  bindHost?: string;
  /** Bind port for HTTP transport. */
  port?: string;
  /** Build and validate service composition without launching transport. */
  dryRun?: boolean;
  /** Print startup summary as JSON. */
  json?: boolean;
};

/**
 * MCP server start command.
 */
export default function setup() {
  const program = new FrodoCommand('frodo mcp server start', [])
    .description('Start an MCP server session from frodo-lib capabilities.')
    .withStability('experimental')
    .addOption(
      new Option('--policy <preset>', 'Capability policy preset.')
        .choices(['read-only', 'standard', 'admin'])
        .default('standard')
    )
    .addOption(
      new Option(
        '--include-domains <domain...>',
        'Only include the listed top-level domains in capability discovery.'
      )
    )
    .addOption(
      new Option(
        '--exclude-domains <domain...>',
        'Exclude listed top-level domains from capability discovery.'
      )
    )
    .addOption(
      new Option(
        '--include-utils',
        'Include the utils domain in discovery.'
      ).default(false)
    )
    .addOption(
      new Option('--transport <transport>', 'Server transport mode.')
        .choices(['stdio', 'http'])
        .default('stdio')
    )
    .addOption(
      new Option('--bind-host <host>', 'Bind host for HTTP transport.').default(
        '127.0.0.1'
      )
    )
    .addOption(
      new Option('--port <port>', 'Bind port for HTTP transport.').default(
        '6277'
      )
    )
    .addOption(
      new Option(
        '--dry-run',
        'Build and validate MCP service composition, then exit.'
      ).default(false)
    )
    .addOption(
      new Option('--json', 'Print startup summary as JSON.').default(false)
    )
    .action(async (host, realm, username, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        realm,
        username,
        password,
        options,
        command
      );

      // Pre-authenticate the frodo singleton before starting the MCP server.
      // This ensures subsequent tool calls can access APIs without hitting 401 errors.
      try {
        await frodo.login.getTokens();
      } catch (error) {
        throw new Error(
          `Failed to authenticate MCP server: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const opts = options as McpStartOptions;
      const service = createMcpService({
        policyPreset: opts.policy,
        inventoryOptions: {
          includeTopLevelDomains: opts.includeDomains,
          excludeTopLevelDomains: opts.excludeDomains,
          includeUtils: !!opts.includeUtils,
        },
      });

      const startupSummary = {
        policy: service.policy.name,
        transport: opts.transport,
        http: {
          bindHost: opts.bindHost,
          port: Number(opts.port),
        },
        authMode: inferAuthModeFromState(),
        toolCounts: {
          total: service.manifest.totalToolCount,
          generic: service.manifest.genericTools.length,
          special: service.manifest.specialTools.length,
        },
        descriptorCount: service.manifest.backingDescriptorCount,
      };

      if (opts.json) {
        printMessage(JSON.stringify(startupSummary, null, 2), 'data');
      } else {
        printMessage('MCP server startup summary:', 'info');
        printMessage(`  Policy: ${startupSummary.policy}`);
        printMessage(`  Transport: ${startupSummary.transport}`);
        printMessage(`  Auth mode: ${startupSummary.authMode}`);
        printMessage(
          `  Tools: ${startupSummary.toolCounts.total} total (${startupSummary.toolCounts.generic} generic, ${startupSummary.toolCounts.special} special)`
        );
        printMessage(
          `  Backing descriptors: ${startupSummary.descriptorCount}`
        );
        if (opts.transport === 'http') {
          printMessage(
            `  HTTP endpoint: http://${startupSummary.http.bindHost}:${startupSummary.http.port}/mcp`
          );
        }
      }

      if (opts.dryRun) {
        printMessage('Dry run completed successfully.', 'info');
        return;
      }

      const transport = opts.transport ?? 'stdio';
      if (transport === 'stdio') {
        await startStdioTransport(service);
      } else {
        await startHttpTransport(
          service,
          opts.bindHost ?? '127.0.0.1',
          Number(opts.port ?? '6277')
        );
      }
    });

  return program;
}

/**
 * Infers runtime auth mode from currently configured global state.
 */
function inferAuthModeFromState():
  | 'service-account'
  | 'admin-account'
  | 'state-config' {
  const serviceAccountId = state.getServiceAccountId();
  const serviceAccountJwk = state.getServiceAccountJwk();
  if (serviceAccountId && serviceAccountJwk) {
    return 'service-account';
  }

  const username = state.getUsername();
  const password = state.getPassword();
  if (username && password) {
    return 'admin-account';
  }

  return 'state-config';
}
