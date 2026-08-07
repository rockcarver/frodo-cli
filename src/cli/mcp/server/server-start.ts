import { createMcpService, frodo, state } from '@rockcarver/frodo-lib';
import { Option } from 'commander';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/server';

import {
  startHttpTransport,
  startStdioTransport,
} from '../../../ops/McpServerOps.js';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { type McpPolicyPreset, resolvePolicySelection } from './server-policy';

type McpProfileName =
  | 'all'
  | 'authentication'
  | 'journey-dev'
  | 'authorization'
  | 'federation'
  | 'iga'
  | 'apps'
  | 'managed-objects';

/** Parsed options for `frodo mcp server start`. */
type McpStartOptions = {
  /** Policy preset controlling capability exposure. */
  policy: McpPolicyPreset;
  /** Active surface profile controlling capability scope. */
  profile: McpProfileName;
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

const TARGET_MCP_SPEC_VERSION = '2026-07-28';

/**
 * MCP server start command.
 */
export default function setup() {
  const program = new FrodoCommand('frodo mcp server start', [])
    .description('Start an MCP server session from frodo-lib capabilities.')
    .withStability('experimental')
    .addOption(
      new Option(
        '--policy <preset>',
        'Capability policy preset (agentic excludes import/export by default).'
      )
        .choices(['read-only', 'agentic', 'standard', 'admin'])
        .default('agentic')
    )
    .addOption(
      new Option(
        '--profile <profile>',
        'Subject profile controlling the capability surface.'
      )
        .choices([
          'all',
          'authentication',
          'journey-dev',
          'authorization',
          'federation',
          'iga',
          'apps',
          'managed-objects',
        ])
        .default('all')
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

      const opts = options as McpStartOptions;
      const policySelection = resolvePolicySelection(opts.policy);
      const service = createMcpService({
        profileName: opts.profile,
        policyPreset: policySelection.policyPreset,
        policyOverride: policySelection.policyOverride,
        inventoryOptions: {
          includeTopLevelDomains: opts.includeDomains,
          excludeTopLevelDomains: opts.excludeDomains,
          includeUtils: !!opts.includeUtils,
        },
        // Reuse the preconfigured frodo singleton; the CLI has already
        // applied connection credentials via handleDefaultArgsAndOpts.
        runtimeOptions: {
          resolveFrodoForRequest: async () => frodo,
        },
      });

      const startupSummary = {
        policy: service.policy.name,
        profile: opts.profile,
        transport: opts.transport,
        http: {
          bindHost: opts.bindHost,
          port: Number(opts.port),
        },
        authMode: inferAuthModeFromState(),
        toolCounts: {
          total: service.manifest.totalToolCount,
          canonical: service.manifest.canonicalTools?.length ?? 0,
          special: service.manifest.specialTools.length,
          discovery: 1,
        },
        descriptorCount: service.manifest.backingDescriptorCount,
        importExportExposed: {
          export: service.capabilities.some(
            (descriptor) => descriptor.operationType === 'export'
          ),
          import: service.capabilities.some(
            (descriptor) => descriptor.operationType === 'import'
          ),
        },
      };

      if (opts.json) {
        printMessage(JSON.stringify(startupSummary, null, 2), 'data');
      } else {
        printMessage('MCP server startup summary:', 'info');
        printMessage(`  Policy: ${startupSummary.policy}`);
        printMessage(`  Profile: ${startupSummary.profile}`);
        printMessage(`  Transport: ${startupSummary.transport}`);
        printMessage(`  Auth mode: ${startupSummary.authMode}`);
        printMessage(
          `  Tools: ${startupSummary.toolCounts.total} total (${startupSummary.toolCounts.canonical} canonical, ${startupSummary.toolCounts.special} special, ${startupSummary.toolCounts.discovery} discovery)`
        );
        printMessage(
          `  Backing descriptors: ${startupSummary.descriptorCount}`
        );
        printMessage(
          `  Import/export exposed: export=${startupSummary.importExportExposed.export}, import=${startupSummary.importExportExposed.import}`
        );
        if (opts.transport === 'http') {
          printMessage(
            `  HTTP endpoint (planned): http://${startupSummary.http.bindHost}:${startupSummary.http.port}/mcp`
          );
        }

        const protocolSupportWarning = buildProtocolSupportWarning();
        if (protocolSupportWarning) {
          printMessage(protocolSupportWarning, 'warning');
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

function buildProtocolSupportWarning(): string | null {
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(TARGET_MCP_SPEC_VERSION)) {
    return null;
  }

  return (
    `  Warning: Legacy @modelcontextprotocol/sdk (v1 monolith) does not advertise MCP ${TARGET_MCP_SPEC_VERSION} support ` +
    `(supported: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}). ` +
    'The server can still run, but full MCP 2026-07-28 conformance requires migration to the v2 SDK packages (@modelcontextprotocol/server and @modelcontextprotocol/client, plus optional adapters).'
  );
}

/**
 * Infers runtime auth mode from currently configured global state.
 */
function inferAuthModeFromState():
  'service-account' | 'admin-account' | 'state-config' {
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
