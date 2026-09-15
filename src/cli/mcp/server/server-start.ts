import {
  createMcpService,
  frodo,
  hydrateMcpDiscoveryContext,
  listMcpProfiles,
  type McpDiscoveryHydrationEvent,
  resolveRequestScopedFrodo,
  state,
} from '@rockcarver/frodo-lib';
import type { McpProfileName } from '@rockcarver/frodo-lib/types/mcp/ProfileRegistry';
import { Option } from 'commander';

import * as s from '../../../help/SampleData';
import {
  cliBrowserLoginPromptHandler,
  getUseDeviceFlow,
} from '../../../ops/AuthenticateOps.js';
import { loadClaimMappingConfig } from '../../../ops/McpClaimMapping.js';
import {
  MCP_LOG_LEVELS,
  McpLogger,
  type McpLogLevel,
} from '../../../ops/McpLogger.js';
import {
  buildAmOAuthMetadata,
  buildAmTokenInfoVerifier,
  buildClaimMappedCredentialResolver,
  buildExternalIdpVerifier,
  computeHttpAllowedHosts,
  fetchExternalIdpMetadata,
  isLoopbackBindHost,
  type McpOAuthResourceServerOptions,
  McpServerStartupInfo,
  resolveFrodoForMcpRequest,
  startHttpTransport,
  startStdioTransport,
} from '../../../ops/McpServerOps.js';
import c from '../../../utils/ColorTheme';
import { printMessage } from '../../../utils/Console';
import { FrodoCommand } from '../../FrodoCommand';
import { resolveMcpAuthTokenValue } from './server-auth';
import {
  parseMcpHttpPortOption,
  resolveMcpHttpMaxBodySize,
  resolveMcpHttpMaxConcurrentRequests,
} from './server-limits';
import { type McpPolicyPreset, resolvePolicySelection } from './server-policy';

/**
 * `--profile`'s selectable values: the same "user-facing" set frodo-lib's
 * own `listMcpProfiles()` returns (also what `frodo mcp server profiles`
 * lists) — deliberately excludes `'platform-admin'`/`'disabled'`, frodo-lib's
 * own internal/composition-only profiles (`listAllMcpProfiles()`'s superset).
 * Derived at module load rather than hand-listed, so this can't drift out of
 * sync with the registry again — a real bug fixed here: `.choices()` used to
 * hardcode a stale list that was missing `'self-service'` after it shipped.
 */
const CLI_SELECTABLE_PROFILES = listMcpProfiles().map(
  (profile) => profile.name
);
type McpStartProfileName = (typeof CLI_SELECTABLE_PROFILES)[number];

/** Parsed options for `frodo mcp server start`. */
type McpStartOptions = {
  /** Policy preset controlling skill exposure. */
  policy: McpPolicyPreset;
  /** Active surface profile controlling skill scope. */
  profile: McpStartProfileName;
  /** Optional allow-list of top-level skill domains. */
  includeDomains?: string[];
  /** Optional deny-list of top-level skill domains. */
  excludeDomains?: string[];
  /** Whether to include the `utils` top-level domain. */
  includeUtils?: boolean;
  /** Transport mode to launch. */
  transport?: 'stdio' | 'http';
  /** Bind host for HTTP transport. */
  bindHost?: string;
  /** Bind port for HTTP transport. */
  port?: string;
  /** Extra Host header values accepted by the HTTP transport. */
  allowedHosts?: string[];
  /** Bearer token required on /mcp requests (CLI flag; env fallback). */
  mcpAuthToken?: string;
  /**
   * Escape hatch permitting a non-loopback bind without a bearer token.
   * Explicitly named because it exposes tenant operations to anything that
   * can reach the port.
   */
  allowUnauthenticated?: boolean;
  /**
   * "Shared mode": the HTTP transport becomes a real OAuth 2.1 resource
   * server — each request presents its own bearer token, verified against
   * the target tenant, instead of one identity pre-authenticated at
   * startup and gated by a shared secret.
   */
  oauthResourceServer?: boolean;
  /**
   * External-IDP "shared mode": validate bearer tokens against a
   * third-party OIDC provider (Entra ID, Okta, etc.) instead of the
   * target AM/AIC tenant. Requires --oauth-resource-server,
   * --external-idp-audience, and --claims-config together.
   */
  externalIdpIssuer?: string;
  /** Expected audience/client-id claim for --external-idp-issuer. */
  externalIdpAudience?: string;
  /**
   * Path to the claim-to-service-account mapping config file (see
   * McpClaimMapping.ts). Required with --external-idp-issuer.
   */
  claimsConfig?: string;
  /**
   * Explicit override for this MCP server's own externally-reachable base
   * URL, used as the RFC 9728 `resource` value instead of the one derived
   * from --bind-host/--port. Necessary whenever --bind-host is a wildcard
   * (e.g. 0.0.0.0, never itself a dialable address) or a reverse
   * proxy/container bridge sits between clients and this process. Requires
   * --oauth-resource-server.
   */
  publicUrl?: string;
  /**
   * A pre-provisioned, public (no-secret) OAuth client_id this server hands
   * back to any caller attempting Dynamic Client Registration, instead of
   * requiring the target AM/AIC tenant or external IDP to genuinely support
   * RFC 7591 (most don't -- see `--registered-client-id`'s own help text).
   * Requires --oauth-resource-server.
   */
  registeredClientId?: string;
  /** Max accepted POST /mcp body size in bytes (CLI flag; env fallback). */
  maxBodySize?: string;
  /** Max concurrent POST /mcp handler executions (CLI flag; env fallback). */
  maxConcurrentRequests?: string;
  /** Build and validate service composition without launching transport. */
  dryRun?: boolean;
  /** Print startup summary as JSON. */
  json?: boolean;
  /** MCP protocol logging threshold. */
  mcpLogLevel: McpLogLevel;
};

/**
 * Resolves the effective HTTP bearer token: the CLI flag wins over the
 * `FRODO_MCP_AUTH_TOKEN` environment fallback, since the environment keeps
 * the secret out of process listings (`ps`) while the flag exists for parity
 * and testing.
 */
function resolveMcpAuthToken(opts: McpStartOptions): string | undefined {
  return resolveMcpAuthTokenValue(
    opts.mcpAuthToken,
    process.env.FRODO_MCP_AUTH_TOKEN
  );
}

/**
 * MCP server start command.
 */
export default function setup() {
  // 'no-cache'/'flush-cache': the token cache is hard-coded off for this
  // command (see below) — showing these flags in --help would suggest a
  // choice that doesn't actually exist here.
  const program = new FrodoCommand('frodo mcp server start', [
    'realm',
    'no-cache',
    'flush-cache',
  ])
    .description('Start an MCP server session from frodo-lib skills.')
    .withStability('experimental')
    .suppressStabilityWarning()
    .addOption(
      new Option(
        '--policy <preset>',
        'Skill policy preset (agentic excludes import/export by default). See `frodo mcp server policies` for guidance.'
      )
        .choices(['read-only', 'agentic', 'standard', 'admin'])
        .default('agentic')
    )
    .addOption(
      new Option(
        '--profile <profile>',
        'Subject profile controlling the skill surface.'
      )
        .choices(CLI_SELECTABLE_PROFILES)
        .default('all')
    )
    .addOption(
      new Option(
        '--include-domains <domain...>',
        'Only include the listed top-level domains in skill discovery.'
      )
    )
    .addOption(
      new Option(
        '--exclude-domains <domain...>',
        'Exclude listed top-level domains from skill discovery.'
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
      new Option(
        '--port <port>',
        "Bind port for HTTP transport, or 'auto' to let the OS assign an ephemeral port (the resolved port is printed and used for the lockfile)."
      ).default('6277')
    )
    .addOption(
      new Option(
        '--allowed-hosts <host...>',
        'Extra Host header values the HTTP transport accepts, extending the default localhost set (localhost, 127.0.0.1, [::1]). host.docker.internal is added automatically when binding a non-loopback host. Variadic: it swallows everything after it, so put positional arguments before it or separate them with --.'
      )
    )
    .addOption(
      new Option(
        '--mcp-auth-token <secret>',
        'Bearer token required on /mcp requests. Falls back to the FRODO_MCP_AUTH_TOKEN environment variable, which keeps the secret out of process listings. Required when binding a non-loopback host.'
      )
    )
    .addOption(
      new Option(
        '--allow-unauthenticated',
        'Allow binding a non-loopback host without a bearer token. Anything that can reach the port can then drive tenant operations with the startup credentials.'
      ).default(false)
    )
    .addOption(
      new Option(
        '--oauth-resource-server',
        `"Shared mode" — requires --transport http. Instead of authenticating once at startup and gating access with a shared secret (--mcp-auth-token), each request presents its own bearer token, verified per-request, and is served as a per-request identity. By default (AM as IdP), the token is verified against the target tenant's own /oauth2/tokeninfo endpoint and used directly as the AM credential. Pass --external-idp-issuer to instead validate tokens from a third-party OIDC provider (see below). Mutually exclusive with --mcp-auth-token/--allow-unauthenticated. The target host must be a full URL with an explicit --type (or --deployment-type): this mode never authenticates at startup, so alias/connection-profile resolution — which only happens as a side effect of logging in — does not run.`
      ).default(false)
    )
    .addOption(
      new Option(
        '--external-idp-issuer <url>',
        'External-IDP "shared mode": validate bearer tokens against this third-party OIDC provider (its issuer URL, e.g. https://login.microsoftonline.com/<tenant>/v2.0) instead of the target AM/AIC tenant. Requires --oauth-resource-server, --external-idp-audience, and --claims-config together. The external identity only gates access to this server and selects (via --claims-config) which pre-provisioned service account a session uses — it is never itself usable as an AM credential, and can never resolve to an admin account or the profile\'s own primary account.'
      )
    )
    .addOption(
      new Option(
        '--external-idp-audience <audience>',
        'Expected audience (client id) claim on tokens from --external-idp-issuer.'
      )
    )
    .addOption(
      new Option(
        '--claims-config <file>',
        'Path to the claim-to-service-account mapping config for --external-idp-issuer: { claimName: string, mappings: [{ claimValue, serviceAccount }, ...] }. Each serviceAccount must already exist on the target connection profile (see `frodo conn service-account add`). A token whose configured claim matches nothing in this table is refused — there is no default/fallback credential.'
      )
    )
    .addOption(
      new Option(
        '--public-url <url>',
        "Override this MCP server's own externally-reachable base URL (e.g. https://mcp.example.com:6277), used as the RFC 9728 resource value instead of one derived from --bind-host/--port. Without this, a request's own (allow-listed) Host header is used instead whenever it differs from --bind-host — --public-url is only needed for the cases that can't self-correct that way, chiefly a reverse proxy or TLS-terminating gateway in front of this process. Requires --oauth-resource-server."
      )
    )
    .addOption(
      new Option(
        '--registered-client-id <client-id>',
        'A pre-provisioned, public (no-secret, PKCE-only) OAuth client_id, already registered directly with the target AM/AIC tenant or external IDP, that this server presents on behalf of ANY connecting MCP client. Turns this server into a lightweight OAuth proxy for three endpoints: /oauth2/register (RFC 7591 DCR emulation -- nothing is actually registered, the same client_id is always returned), /oauth2/authorize (a stateless redirect to the real upstream authorize endpoint, params passed straight through, including the client\'s own redirect_uri), and /oauth2/token (a stateless relay to the real upstream token endpoint). This server also becomes the advertised issuer while this is set (required for a spec-compliant client to actually fetch these overridden endpoints at all: a client validates the issuer in fetched metadata against the URL it used to fetch it, so once issuer points elsewhere the client goes straight to the real upstream\'s own metadata instead, silently bypassing everything above). Necessary because most authorization servers either don\'t support DCR at all (e.g. Entra ID) or require an initial access token to use it (AM\'s own real /oauth2/register does) -- a generic DCR-attempting MCP client otherwise has no way to obtain a client_id or complete the OAuth flow at all. The proxy is stateless: it never stores anything, and the real authorize/token decisions are still made entirely by AM/the external IDP using the real, pre-existing app registration\'s own policy -- this server only relays bytes. For a native/loopback MCP client, the client\'s own (typically ephemeral-port) redirect_uri is passed to the upstream unmodified; this only works if the upstream accepts an unregistered loopback redirect_uri, which RFC 8252 §7.3 requires for exactly this case (confirmed against real AM and Entra ID tenants). A connecting client\'s actual requested redirect_uri is always logged (info level, at /oauth2/register) if you need to confirm or debug this. Requires --oauth-resource-server.'
      )
    )
    .addOption(
      new Option(
        '--max-body-size <bytes>',
        `Maximum accepted request body size in bytes on POST /mcp (default 1048576 = 1 MiB; frodo transport policy, not part of the MCP protocol). Oversized requests are rejected with HTTP 413 before being buffered. Falls back to the FRODO_MCP_MAX_BODY_SIZE environment variable.`
      )
    )
    .addOption(
      new Option(
        '--max-concurrent-requests <n>',
        `Maximum concurrent MCP request handler executions before new requests are rejected with HTTP 429 and Retry-After: 1 (default 64; frodo transport policy). Falls back to the FRODO_MCP_MAX_CONCURRENT_REQUESTS environment variable.`
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
    .addOption(
      new Option('--mcp-log-level <level>', 'MCP protocol log level.')
        .choices([...MCP_LOG_LEVELS])
        .default('info')
    )
    .addHelpText(
      'after',
      `Usage Examples:\n` +
        `  Start MCP server over stdio with default profile and policy:\n` +
        c.command(`  $ frodo mcp server start\n`) +
        `  Validate composition only (no transport start):\n` +
        c.command(`  $ frodo mcp server start --dry-run\n`) +
        `  Start HTTP transport with explicit bind host/port:\n` +
        c.command(
          `  $ frodo mcp server start --transport http --bind-host 127.0.0.1 --port 6277\n`
        ) +
        `  Start HTTP transport for a containerized gateway on this machine (bridge-network containers reach the host via host.docker.internal, which is accepted automatically on a non-loopback bind; a bearer token is required):\n` +
        c.command(
          `  $ frodo mcp server start --transport http --bind-host 0.0.0.0 --port 6277 --mcp-auth-token <secret>\n`
        ) +
        `  Start as an OAuth 2.1 resource server reachable through a reverse proxy or TLS-terminating gateway (its externally-reachable URL differs from --bind-host, so it must be stated explicitly):\n` +
        c.command(
          `  $ frodo mcp server start --transport http --bind-host 0.0.0.0 --port 6277 --oauth-resource-server --public-url https://mcp.example.com\n`
        ) +
        `  Start as an OAuth 2.1 resource server against an authorization server with no usable Dynamic Client Registration (e.g. Entra ID has none at all; AM's own real endpoint needs an initial access token) -- hands a pre-provisioned public client_id to any client that attempts DCR:\n` +
        c.command(
          `  $ frodo mcp server start --transport http --oauth-resource-server --external-idp-issuer https://login.microsoftonline.com/<tenant>/v2.0 --external-idp-audience <client-id> --claims-config claims.json --registered-client-id <your-app-registration-client-id>\n`
        ) +
        `  Accept additional client hostnames (extends the localhost default):\n` +
        c.command(
          `  $ frodo mcp server start --transport http --allowed-hosts mcp.example.internal\n`
        ) +
        `  Start read-only skills surface for authentication scope:\n` +
        c.command(
          `  $ frodo mcp server start --policy read-only --profile authentication\n`
        ) +
        `  Start with selected domains only:\n` +
        c.command(`  $ frodo mcp server start --include-domains authn idm\n`) +
        `  Start authenticated as a username whose password is already saved in a connection profile for this host (no password on the command line):\n` +
        c.command(`  $ frodo mcp server start ${s.amBaseUrl} ${s.username}\n`)
    )
    .action(async (host, username, password, options, command) => {
      command.handleDefaultArgsAndOpts(
        host,
        username,
        password,
        options,
        command
      );
      // The token cache exists to let successive short-lived CLI invocations
      // reuse tokens instead of re-authenticating every time — not relevant
      // to a long-running MCP server, which logs in once and relies on
      // frodo-lib's own auto-refresh for the rest of its lifetime. Worse,
      // it's actively unsafe here: multiple `mcp server start` processes
      // (one per policy/profile) commonly run concurrently against the same
      // host, all reading and writing the same on-disk token cache file —
      // a real corruption/collision risk this command should never
      // participate in. Hard-coded off, not exposed as a configurable
      // default, until that on-disk cache is made safe for concurrent
      // writers (tracked separately).
      state.setUseTokenCache(false);

      const opts = options as McpStartOptions;
      if (opts.json && !opts.dryRun) {
        throw new Error('--json is only supported with --dry-run.');
      }
      const transport = opts.transport ?? 'stdio';
      const authToken =
        transport === 'http' ? resolveMcpAuthToken(opts) : undefined;
      if (opts.oauthResourceServer) {
        if (transport !== 'http') {
          throw new Error('--oauth-resource-server requires --transport http.');
        }
        if (authToken || opts.allowUnauthenticated) {
          throw new Error(
            '--oauth-resource-server is mutually exclusive with --mcp-auth-token/FRODO_MCP_AUTH_TOKEN and --allow-unauthenticated: a server is either shared-secret-gated or a real per-connection OAuth2 resource server, never both.'
          );
        }
        if (!isFullUrl(state.getHost()) || !state.getDeploymentType()) {
          throw new Error(
            '--oauth-resource-server requires a full host URL and an explicit --type: this mode never authenticates at startup, so alias/connection-profile resolution (which only happens as a side effect of logging in) does not run.'
          );
        }
        if (/^\s*auto\s*$/i.test(opts.port ?? '')) {
          throw new Error(
            "--oauth-resource-server requires an explicit --port: its own public URL (advertised in RFC 9728 discovery metadata) must be known before the server binds, which an OS-assigned ('auto') port cannot provide."
          );
        }
      }
      const externalIdpOptionsGiven = [
        opts.externalIdpIssuer,
        opts.externalIdpAudience,
        opts.claimsConfig,
      ].filter((value) => value !== undefined).length;
      if (externalIdpOptionsGiven > 0) {
        if (!opts.oauthResourceServer) {
          throw new Error(
            '--external-idp-issuer/--external-idp-audience/--claims-config require --oauth-resource-server.'
          );
        }
        if (externalIdpOptionsGiven < 3) {
          throw new Error(
            '--external-idp-issuer, --external-idp-audience, and --claims-config must be given together.'
          );
        }
      }
      // Loaded here (rather than only later, inline where it's consumed)
      // for two reasons: a --dry-run never reaches that later code at all,
      // so a malformed claims-config file previously went unvalidated by
      // --dry-run; and the startup summary below needs its contents to
      // actually show the operator what's configured, not just that
      // external-IDP mode is on.
      const claimMapping =
        opts.oauthResourceServer && opts.externalIdpIssuer
          ? loadClaimMappingConfig(opts.claimsConfig)
          : undefined;
      // Same reasoning as claimMapping above: validated/resolved here, not
      // only later where it's consumed, so --dry-run catches a malformed
      // --public-url and the startup summary can show what's actually
      // being advertised. --oauth-resource-server's own validation above
      // already rejected an 'auto' --port, so parseMcpHttpPortOption(opts.port)
      // is safe to call this early whenever oauthResourceServer is set.
      if (opts.publicUrl !== undefined && !opts.oauthResourceServer) {
        throw new Error('--public-url requires --oauth-resource-server.');
      }
      let publicUrlOrigin: URL | undefined;
      if (opts.publicUrl !== undefined) {
        try {
          publicUrlOrigin = new URL(opts.publicUrl);
        } catch {
          throw new Error(
            `--public-url '${opts.publicUrl}' is not a valid absolute URL, e.g. https://mcp.example.com:6277.`
          );
        }
      }
      const resourceServerUrl = opts.oauthResourceServer
        ? publicUrlOrigin
          ? new URL('/mcp', publicUrlOrigin)
          : new URL(
              `http://${opts.bindHost ?? '127.0.0.1'}:${parseMcpHttpPortOption(opts.port)}/mcp`
            )
        : undefined;
      if (opts.registeredClientId !== undefined && !opts.oauthResourceServer) {
        throw new Error(
          '--registered-client-id requires --oauth-resource-server.'
        );
      }
      // Transport-policy limits (HTTP only): resolved before the refusal
      // check so an operator who mistyped either value sees the fallback
      // note in the log regardless of what happens later in startup.
      let maxBodySizeBytes: number | undefined;
      let maxConcurrentRequests: number | undefined;
      if (transport === 'http') {
        const warnInvalidLimit =
          (name: string) => (invalid: { flag?: string; env?: string }) => {
            const parts = [];
            if (invalid.flag !== undefined) {
              parts.push(`--${name} '${invalid.flag}'`);
            }
            if (invalid.env !== undefined) {
              parts.push(
                `${name === 'max-body-size' ? 'FRODO_MCP_MAX_BODY_SIZE' : 'FRODO_MCP_MAX_CONCURRENT_REQUESTS'}='${invalid.env}'`
              );
            }
            printMessage(
              `Ignoring invalid MCP HTTP transport limit ${parts.join(' and ')}; using the documented default.`,
              'warn'
            );
          };
        maxBodySizeBytes = resolveMcpHttpMaxBodySize(
          opts.maxBodySize,
          process.env.FRODO_MCP_MAX_BODY_SIZE,
          warnInvalidLimit('max-body-size')
        );
        maxConcurrentRequests = resolveMcpHttpMaxConcurrentRequests(
          opts.maxConcurrentRequests,
          process.env.FRODO_MCP_MAX_CONCURRENT_REQUESTS,
          warnInvalidLimit('max-concurrent-requests')
        );
      }
      if (
        transport === 'http' &&
        !isLoopbackBindHost(opts.bindHost ?? '127.0.0.1') &&
        !authToken &&
        !opts.allowUnauthenticated &&
        !opts.oauthResourceServer
      ) {
        throw new Error(
          `Refusing to start the MCP HTTP server on non-loopback bind host '${opts.bindHost}' without a bearer token: anything that can reach the port could drive tenant operations with these startup credentials. Pass --mcp-auth-token <secret> (or set FRODO_MCP_AUTH_TOKEN), --oauth-resource-server, or --allow-unauthenticated to accept the risk explicitly.`
        );
      }
      const logger = new McpLogger(opts.mcpLogLevel);
      // OAuth-resource-server mode never authenticates at the process
      // level — there is no single startup identity to establish; each
      // request brings its own, verified independently (see
      // buildAmTokenInfoVerifier / McpServerOps's bearer-token auth mode).
      if (state.getHost() && !opts.oauthResourceServer) {
        if (state.getAuthMode() === 'interactive') {
          await frodo.login.getTokensInteractive({
            useDeviceFlow: getUseDeviceFlow(),
            promptHandler: cliBrowserLoginPromptHandler,
          });
        } else {
          await frodo.login.getTokens();
        }
      }
      const activeHost = sanitizeHost(state.getHost());
      // TODO(oauth-resource-server): confirmed live that both hydration
      // catalogs unconditionally fail in this mode -- `frodoInstance: frodo`
      // below is the process singleton, deliberately never authenticated
      // when `opts.oauthResourceServer` is set (see the comment above), so
      // `readManagedObjectTypes()`/`readConfigEntityStubs()` always hit an
      // unauthenticated session and always get rejected. Not a bug (the
      // fallback to static skill metadata already handles it gracefully),
      // but worth deciding deliberately rather than by accident: either
      // skip hydration outright in this mode (skip the two guaranteed-401
      // startup calls entirely), or find some other way to hydrate (e.g.
      // once the first verified request resolves a real credential).
      const discoveryContext = await hydrateMcpDiscoveryContext({
        frodoInstance: frodo,
        activeTarget: {
          host: activeHost,
          profile: opts.profile,
        },
        onEvent: (event) => logDiscoveryHydrationEvent(logger, event),
      });
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
        discoveryContext,
        // Reuse the preconfigured frodo singleton for the common case (no
        // per-call realm override) so most requests skip a redundant
        // re-authentication round trip; the CLI has already applied
        // connection credentials via handleDefaultArgsAndOpts. See
        // resolveFrodoForMcpRequest for why a per-call realm override
        // still needs to fall back to a genuinely scoped instance.
        runtimeOptions: {
          // OAuth-resource-server mode has no authenticated singleton to
          // reuse — resolveFrodoForMcpRequest's short-circuit ("no realm
          // override → reuse the singleton") would otherwise silently
          // ignore each request's own verified bearer-token identity and
          // try the empty, never-logged-in singleton instead. Every
          // request in this mode must construct its own scoped instance,
          // regardless of realm.
          resolveFrodoForRequest: opts.oauthResourceServer
            ? (context) => resolveRequestScopedFrodo(context, frodo)
            : (context) =>
                resolveFrodoForMcpRequest(context, frodo, state.getRealm()),
          executeRecommendedByDefault: true,
          // Only matters for a per-call realm override that forces a new
          // scoped instance (the common case reuses the already-logged-in
          // singleton above) — see buildRequestContext()'s browser branch.
          browserLoginPromptHandler: cliBrowserLoginPromptHandler,
        },
      });

      const startupSummary = {
        policy: service.policy.name,
        profile: opts.profile,
        transport: opts.transport,
        http: {
          bindHost: opts.bindHost,
          // The dry-run summary shows the literal option value: 'auto' as the
          // string the operator typed (not the internal 0 it resolves to),
          // else the parsed number. Only the live startup learns the
          // OS-resolved port (the listening line and the lockfile carry it).
          port: opts.dryRun
            ? ((/^\s*auto\s*$/i.test(opts.port ?? '')
                ? 'auto'
                : parseMcpHttpPortOption(opts.port)) as number | 'auto')
            : parseMcpHttpPortOption(opts.port),
          // Never the token value itself — summaries and logs are shipped to
          // MCP clients as protocol-level messages.
          allowedHosts:
            transport === 'http'
              ? computeHttpAllowedHosts(
                  opts.bindHost ?? '127.0.0.1',
                  opts.allowedHosts
                )
              : undefined,
          auth:
            transport === 'http'
              ? opts.oauthResourceServer
                ? ('oauth-resource-server' as const)
                : authToken
                  ? ('on' as const)
                  : ('off' as const)
              : undefined,
        },
        authMode: opts.oauthResourceServer
          ? ('oauth-resource-server' as const)
          : inferAuthModeFromState(),
        host: activeHost,
        deploymentType: state.getDeploymentType() ?? 'unknown',
        toolCounts: {
          total: service.manifest.totalToolCount,
          canonical: service.manifest.canonicalTools?.length ?? 0,
          discovery: 1,
        },
        skillCount: service.manifest.backingDescriptorCount,
        importExportExposed: {
          export: service.capabilities.some(
            (descriptor) => descriptor.operationType === 'export'
          ),
          import: service.capabilities.some(
            (descriptor) => descriptor.operationType === 'import'
          ),
        },
        resourceServerUrl: resourceServerUrl
          ? {
              value: resourceServerUrl.toString(),
              source: publicUrlOrigin
                ? ('explicit' as const)
                : ('derived-from-bind-host' as const),
            }
          : undefined,
        registeredClientId: opts.registeredClientId,
        // Issuer/audience/claim-mapping are all operator-supplied
        // configuration, not secrets (the JWKs/tokens they gate are never
        // included) — printing them is exactly what confirms the intended
        // settings actually took effect instead of silently falling back
        // to something else, the same reasoning every other field here
        // already follows.
        externalIdp: claimMapping
          ? {
              issuer: opts.externalIdpIssuer!,
              audience: opts.externalIdpAudience!,
              claimName: claimMapping.claimName,
              mappings: claimMapping.mappings.map((m) => ({
                claimValue: m.claimValue,
                serviceAccount: m.serviceAccount,
              })),
            }
          : undefined,
      };

      if (opts.dryRun) {
        if (opts.json) {
          printMessage(JSON.stringify(startupSummary, null, 2), 'data');
        } else {
          printStartupSummary(startupSummary);
        }
        printMessage('Dry run completed successfully.', 'info');
        return;
      }

      logStartupSummary(logger, startupSummary);
      const startupInfo: McpServerStartupInfo = { logger };
      if (transport === 'stdio') {
        await startStdioTransport(service, startupInfo);
      } else {
        const resolvedPort = parseMcpHttpPortOption(opts.port);
        let oauthResourceServerOptions:
          McpOAuthResourceServerOptions | undefined;
        if (opts.oauthResourceServer && opts.externalIdpIssuer) {
          // External-IDP "shared mode": validate against a third-party
          // OIDC provider and map the verified identity's claims to a
          // pre-provisioned service account — never the caller's own
          // (non-AM) token, and never an admin/primary-account credential
          // (the claim-mapping schema can't express either).
          const { oauthMetadata, jwks } = await fetchExternalIdpMetadata(
            opts.externalIdpIssuer
          );
          oauthResourceServerOptions = {
            verifier: buildExternalIdpVerifier(
              oauthMetadata,
              jwks,
              opts.externalIdpAudience
            ),
            oauthMetadata,
            // Guaranteed defined here: this whole branch only runs when
            // opts.oauthResourceServer is set, the same condition the
            // earlier computation used.
            resourceServerUrl: resourceServerUrl!,
            resourceServerUrlIsExplicit: Boolean(publicUrlOrigin),
            registeredClientId: opts.registeredClientId,
            resolveCredential: buildClaimMappedCredentialResolver(
              // Guaranteed defined here: this branch only runs when
              // opts.externalIdpIssuer is set, the same condition the
              // earlier load above used.
              claimMapping!,
              state.getHost()
            ),
          };
        } else if (opts.oauthResourceServer) {
          // AM-as-IdP mode: the caller's own token IS the AM credential.
          oauthResourceServerOptions = {
            verifier: buildAmTokenInfoVerifier(state.getHost()),
            oauthMetadata: buildAmOAuthMetadata(state.getHost()),
            resourceServerUrl: resourceServerUrl!,
            resourceServerUrlIsExplicit: Boolean(publicUrlOrigin),
            registeredClientId: opts.registeredClientId,
          };
        }
        await startHttpTransport(
          service,
          opts.bindHost ?? '127.0.0.1',
          resolvedPort,
          startupInfo,
          {
            allowedHosts: opts.allowedHosts,
            authToken,
            maxBodySizeBytes,
            maxConcurrentRequests,
            oauthResourceServer: oauthResourceServerOptions,
          }
        );
      }
    });

  return program;
}

/** Whether `host` parses as a full, absolute URL (not a bare alias/substring). */
function isFullUrl(host?: string): boolean {
  if (!host) {
    return false;
  }
  try {
    new URL(host);
    return true;
  } catch {
    return false;
  }
}

type StartupSummary = {
  policy: string;
  profile: McpProfileName;
  transport?: 'stdio' | 'http';
  http: {
    bindHost?: string;
    // The port the summary reports: the resolved number on a live start, the
    // parsed option value (or the literal 'auto') on a dry run.
    port: number | 'auto';
    allowedHosts?: string[];
    auth?: 'on' | 'off' | 'oauth-resource-server';
  };
  authMode:
    | 'service-account'
    | 'admin-account'
    | 'state-config'
    | 'oauth-resource-server';
  host?: string;
  deploymentType: string;
  toolCounts: { total: number; canonical: number; discovery: number };
  skillCount: number;
  importExportExposed: { export: boolean; import: boolean };
  // Only present in --oauth-resource-server mode. `source: 'explicit'` is
  // fixed for every request (--public-url); `'derived-from-bind-host'` is
  // only the startup-time fallback -- a live request whose own (allow-
  // listed) Host header differs advertises that instead, per-request. See
  // McpServerOps.ts's resolveResourceServerUrl.
  resourceServerUrl?: {
    value: string;
    source: 'explicit' | 'derived-from-bind-host';
  };
  // Present only when --registered-client-id is configured. The id itself
  // is public/non-secret by design (see registeredClientId's own remarks),
  // so printing it is safe and exactly what confirms the DCR shim is
  // actually active.
  registeredClientId?: string;
  externalIdp?: {
    issuer: string;
    audience: string;
    claimName: string;
    mappings: { claimValue: string; serviceAccount: string }[];
  };
};

function formatStartupMessages(summary: StartupSummary): string[] {
  return [
    "Experimental feature in use: 'frodo mcp server start'. This feature may change without notice.",
    `MCP server connected to ${summary.host ?? 'an unresolved host'} (${summary.deploymentType}).`,
    `Policy: ${summary.policy}`,
    `Profile: ${summary.profile}`,
    `Transport: ${summary.transport}`,
    `Auth mode: ${summary.authMode}`,
    ...(summary.http.allowedHosts
      ? [`HTTP allowed hosts: ${summary.http.allowedHosts.join(', ')}`]
      : []),
    ...(summary.http.auth ? [`HTTP auth: ${summary.http.auth}`] : []),
    ...(summary.resourceServerUrl
      ? [
          summary.resourceServerUrl.source === 'explicit'
            ? `Resource server URL: ${summary.resourceServerUrl.value} (from --public-url)`
            : `Resource server URL: ${summary.resourceServerUrl.value} (derived from --bind-host; a request's own Host header is used instead per-request whenever it differs and passes the Host allow-list — pass --public-url to fix this instead, e.g. behind a reverse proxy)`,
        ]
      : []),
    ...(summary.registeredClientId
      ? [
          `Registered client id (DCR shim, /oauth2/register): ${summary.registeredClientId}`,
          `  A connecting client's requested redirect_uri is logged (info level) the first time it registers -- configure that exact value on the app registration on AM/the external IDP.`,
        ]
      : []),
    `Tools: ${summary.toolCounts.total} total (${summary.toolCounts.canonical} canonical, ${summary.toolCounts.discovery} discovery)`,
    `Backing skills: ${summary.skillCount}`,
    `Import/export exposed: export=${summary.importExportExposed.export}, import=${summary.importExportExposed.import}`,
    ...(summary.externalIdp
      ? [
          `External IDP issuer: ${summary.externalIdp.issuer}`,
          `External IDP audience: ${summary.externalIdp.audience}`,
          `Claims config: matching '${summary.externalIdp.claimName}' claim, ${summary.externalIdp.mappings.length} mapping(s):`,
          ...summary.externalIdp.mappings.map(
            (m) => `  ${m.claimValue} -> ${m.serviceAccount}`
          ),
        ]
      : []),
  ];
}

function logStartupSummary(logger: McpLogger, summary: StartupSummary): void {
  logger.info(
    'startup',
    "Experimental feature in use: 'frodo mcp server start'. This feature may change without notice."
  );
  logger.info(
    'startup',
    `Connected to ${summary.host ?? 'an unresolved host'} (${summary.deploymentType}).`
  );
  for (const message of formatStartupMessages(summary).slice(2)) {
    logger.debug('startup.configuration', message);
  }
}

function printStartupSummary(summary: StartupSummary): void {
  printMessage('MCP server startup summary:', 'info');
  for (const message of formatStartupMessages(summary).slice(1)) {
    printMessage(`  ${message}`);
  }
}

function sanitizeHost(host?: string): string | undefined {
  if (!host) {
    return undefined;
  }
  try {
    const url = new URL(host);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

function logDiscoveryHydrationEvent(
  logger: McpLogger,
  event: McpDiscoveryHydrationEvent
): void {
  const catalogLabel =
    event.catalog === 'managed-object-types'
      ? 'managed-object types'
      : 'config entity IDs';
  if (event.status === 'available') {
    logger.info(
      'startup.discovery',
      `Hydrated ${event.count} ${catalogLabel} for discovery.`
    );
    return;
  }
  if (event.status === 'failed' || event.status === 'timed-out') {
    logger.warn(
      'startup.discovery',
      `${catalogLabel} discovery hydration ${event.status}; continuing with static skill metadata.`
    );
  }
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
