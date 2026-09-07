import { frodo, state } from '@rockcarver/frodo-lib';
import type { OAuth2ClientSkeleton } from '@rockcarver/frodo-lib/types/api/OAuth2ClientApi';
import type { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';

import { printMessage } from '../utils/Console';
import { escapableSelect } from '../utils/interactive/EscapableSelectPrompt';
import { cloneDeep } from './utils/OpsUtils';
import OAUTH2_CLIENT_TEMPLATE from './templates/OAuth2ClientTemplate.json';

const constants = frodo.utils.constants;
const {
  client: { readOAuth2Client, createOAuth2Client, updateOAuth2Client },
} = frodo.oauth2oidc;
const { readScript, createScript, updateScript } = frodo.script;
const { getInfo } = frodo.info;

/**
 * Frodo's own loopback listener always binds `127.0.0.1` with this default
 * path when no explicit redirect URI is given (see
 * BrowserAuthenticateOps.ts's `DEFAULT_CALLBACK_PATH`) — the wildcard
 * pattern below is built to match that exactly.
 */
const LOOPBACK_CALLBACK_PATH = '/callback';
/**
 * Matches AIC's own built-in client's one literal registered redirect URI
 * (`CLOUD_BROWSER_LOGIN_REDIRECT_URI` in AuthenticateOps.ts) — reused here
 * as the fixed fallback for AM versions that don't support wildcard-port
 * loopback redirects, for a consistent default across deployment types.
 */
const FIXED_FALLBACK_REDIRECT_URI = 'http://localhost:3000';
/**
 * AM's `loopbackInterfaceRedirection` client config field ("Allow wildcard
 * ports in redirection URIs") lets a single registered pattern like
 * `http://127.0.0.1:` + wildcard port + the callback path match any port — exactly what a loopback
 * listener on an OS-assigned ephemeral port needs, so no fixed
 * `--login-redirect-uri` has to be shared between `login setup` and every
 * later `frodo login --browser` invocation. Confirmed present in AM 7.2.2's
 * docs and live-tested working against a real AM 9.0.0-SNAPSHOT tenant
 * (accepted an arbitrary loopback port at `/oauth2/authorize`, rejected a
 * genuinely different host) — exact version it was introduced in is not
 * pinned down (ForgeRock/PingAM's own release notes don't call it out
 * explicitly in what's searchable), so this gates on AM major version 7+
 * as a conservative, confirmed-safe floor rather than assuming universal
 * support.
 */
const MIN_AM_MAJOR_VERSION_FOR_WILDCARD_LOOPBACK = 7;

function parseAmMajorVersion(amVersion: string | undefined): number | undefined {
  const match = amVersion?.match(/^(\d+)\./);
  return match ? Number(match[1]) : undefined;
}

type ResolvedRedirectUri = {
  redirectUri: string;
  wildcardLoopback: boolean;
  note?: string;
};

/**
 * Resolves the redirect URI to register, and whether it's a wildcard
 * loopback pattern or a fixed exact value. An explicit `--login-redirect-uri`
 * always wins (fixed, exact — the caller's own choice, no detection
 * needed). Otherwise, detects the target AM's version and prefers a
 * wildcard loopback pattern when it's new enough, falling back to a fixed
 * default otherwise.
 */
async function resolveRedirectUri(
  explicitRedirectUri: string | undefined
): Promise<ResolvedRedirectUri> {
  if (explicitRedirectUri) {
    return { redirectUri: explicitRedirectUri, wildcardLoopback: false };
  }
  try {
    const info = await getInfo();
    const majorVersion = parseAmMajorVersion(info?.amVersion);
    if (
      majorVersion !== undefined &&
      majorVersion >= MIN_AM_MAJOR_VERSION_FOR_WILDCARD_LOOPBACK
    ) {
      return {
        redirectUri: `http://127.0.0.1:*${LOOPBACK_CALLBACK_PATH}`,
        wildcardLoopback: true,
      };
    }
    return {
      redirectUri: FIXED_FALLBACK_REDIRECT_URI,
      wildcardLoopback: false,
      note: `AM version (${info?.amVersion || 'undetected'}) is older than ${MIN_AM_MAJOR_VERSION_FOR_WILDCARD_LOOPBACK}, or couldn't be determined — falling back to a fixed redirect URI instead of a wildcard loopback pattern.`,
    };
  } catch {
    return {
      redirectUri: FIXED_FALLBACK_REDIRECT_URI,
      wildcardLoopback: false,
      note: "Couldn't detect the AM version — falling back to a fixed redirect URI instead of a wildcard loopback pattern.",
    };
  }
}

/**
 * The one-line session-capture script BROWSER_LOGIN.md documents: captures
 * the real AM SSO session id onto the OAuth2 token response, which is what
 * lets Frodo's existing session-based AM code paths run unchanged after a
 * browser login (see AuthenticateOps.ts's applySessionCaptureToken()).
 */
const SESSION_CAPTURE_SCRIPT_BODY = [
  "accessToken.addExtraData('sessionId', session.getTokenID());",
];

export type SetupBrowserLoginOptions = {
  clientId: string;
  scriptId: string;
  scriptName: string;
  scope: string;
  /** Explicit override only — omit to auto-detect wildcard loopback support. */
  redirectUri?: string;
  enableDeviceGrant: boolean;
  assumeYes: boolean;
};

/**
 * Reads a resource, treating a 404 as "doesn't exist yet" rather than an
 * error — the shared existence check both the idempotency logic and the
 * privilege gate below are built on: an insufficiently-privileged session
 * fails this same read with a 401/403, which propagates as a real error
 * instead of being swallowed here.
 */
async function readIfExists<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if ((error as { httpStatus?: number })?.httpStatus === 404) {
      return undefined;
    }
    throw error;
  }
}

function buildDesiredScript(existing: ScriptSkeleton | undefined): ScriptSkeleton {
  const base = existing ? cloneDeep(existing) : ({} as ScriptSkeleton);
  base.script = SESSION_CAPTURE_SCRIPT_BODY;
  base.language = 'JAVASCRIPT';
  base.context = 'OAUTH2_ACCESS_TOKEN_MODIFICATION';
  base.evaluatorVersion = '1.0';
  base.default = false;
  base.description =
    'Session-capture script for Frodo browser login (adds the AM session id to the OAuth2 access token response). Created/updated by `frodo login setup`. See docs/BROWSER_LOGIN.md.';
  return base;
}

function buildDesiredClient(
  existing: OAuth2ClientSkeleton | undefined,
  options: SetupBrowserLoginOptions,
  resolved: ResolvedRedirectUri
): OAuth2ClientSkeleton {
  const base: OAuth2ClientSkeleton = existing
    ? cloneDeep(existing)
    : (cloneDeep(OAUTH2_CLIENT_TEMPLATE) as OAuth2ClientSkeleton);
  const grantTypes = ['authorization_code'];
  if (options.enableDeviceGrant) {
    grantTypes.push('urn:ietf:params:oauth:grant-type:device_code');
  }
  base.coreOAuth2ClientConfig = {
    ...base.coreOAuth2ClientConfig,
    clientType: { inherited: false, value: 'Public' },
    clientName: { inherited: false, value: [options.clientId] },
    scopes: { inherited: false, value: options.scope.split(' ').filter(Boolean) },
    redirectionUris: { inherited: false, value: [resolved.redirectUri] },
    loopbackInterfaceRedirection: {
      inherited: false,
      value: resolved.wildcardLoopback,
    },
  };
  base.advancedOAuth2ClientConfig = {
    ...base.advancedOAuth2ClientConfig,
    grantTypes: { inherited: false, value: grantTypes },
    responseTypes: { inherited: false, value: ['code'] },
    tokenEndpointAuthMethod: { inherited: false, value: 'none' },
    subjectType: { inherited: false, value: 'Public' },
    isConsentImplied: { inherited: false, value: true },
    descriptions: {
      inherited: false,
      value: [`Created/updated by \`frodo login setup\` on ${new Date().toLocaleString()}.`],
    },
  };
  base.overrideOAuth2ClientConfig = {
    ...base.overrideOAuth2ClientConfig,
    providerOverridesEnabled: true,
    accessTokenModificationPluginType: 'SCRIPTED',
    accessTokenModificationScript: options.scriptId,
  };
  return base;
}

/**
 * Orchestrates the ForgeOps/classic browser-login setup: an OAuth2 public
 * client (authorization-code + PKCE, optionally device grant) wired to a
 * session-capture script, following docs/BROWSER_LOGIN.md's recipe exactly.
 * Idempotent — merges the desired fields onto whatever already exists
 * rather than overwriting wholesale, so a second run (or a client/script
 * that predates this command) is safe to re-run. Requires confirmation
 * (bypassable with `assumeYes`) before writing anything.
 *
 * No separate privilege-classification step: the first read below
 * (`readIfExists`) is the privilege gate — an insufficiently-privileged
 * session fails it with the real 401/403 AM itself returns, which is a more
 * direct and reliable signal than trying to classify the caller's identity
 * kind first (and classic has no IDM for that kind of classification at
 * all — see the plan doc's item 21 for why role-classification alone isn't
 * a substitute for the actual permission check).
 */
export async function setupBrowserLogin(
  options: SetupBrowserLoginOptions
): Promise<boolean> {
  const deploymentType = state.getDeploymentType();
  if (deploymentType === constants.CLOUD_DEPLOYMENT_TYPE_KEY) {
    printMessage(
      'Cloud needs no setup — it uses a fixed, built-in OAuth2 client. `login setup` only applies to forgeops and classic.',
      'warn'
    );
    return false;
  }

  let existingClient: OAuth2ClientSkeleton | undefined;
  let existingScript: ScriptSkeleton | undefined;
  try {
    existingClient = await readIfExists(() => readOAuth2Client(options.clientId));
    existingScript = await readIfExists(() => readScript(options.scriptId));
  } catch (error) {
    printMessage(
      `Could not read the target client/script — this usually means the current session isn't privileged enough. \`login setup\` needs at least a tenant-admin login (username/password) or a sufficiently-scoped service account; a narrowly-scoped browser login, auditor, or theme-admin session won't have realm-config write access.\n\nUnderlying error: ${(error as Error).message}`,
      'error'
    );
    return false;
  }

  const resolved = await resolveRedirectUri(options.redirectUri);
  if (resolved.note) {
    printMessage(resolved.note, 'warn');
  }
  const desiredScript = buildDesiredScript(existingScript);
  const desiredClient = buildDesiredClient(existingClient, options, resolved);
  const grantTypes = ['authorization_code'];
  if (options.enableDeviceGrant) {
    grantTypes.push('urn:ietf:params:oauth:grant-type:device_code');
  }

  printMessage(
    `This will ${existingScript ? 'update' : 'create'} script "${options.scriptId}" and ${existingClient ? 'update' : 'create'} OAuth2 client "${options.clientId}":`,
    'info'
  );
  const summary = [
    `- Script: ${existingScript ? 'update' : 'create'} "${options.scriptId}" (${options.scriptName}) — OAUTH2_ACCESS_TOKEN_MODIFICATION, legacy evaluator`,
    `- Client: ${existingClient ? 'update' : 'create'} "${options.clientId}" — public client, grant types [${grantTypes.join(', ')}], scope "${options.scope}", redirect URI "${resolved.redirectUri}"${resolved.wildcardLoopback ? ' (wildcard loopback port, matches any local port frodo picks)' : ''}`,
    `- Client: wire the session-capture script onto the client (providerOverridesEnabled: true, accessTokenModificationPluginType: SCRIPTED)`,
  ];
  printMessage(summary.join('\n'), 'data');

  if (!options.assumeYes) {
    const proceed = await escapableSelect({
      message: 'Apply these changes?',
      choices: [
        { value: true, name: 'Yes, apply' },
        { value: false, name: 'No, cancel' },
      ],
      default: true,
    });
    if (proceed !== true) {
      printMessage('Cancelled — no changes made.', 'info');
      return false;
    }
  }

  if (existingScript) {
    await updateScript(options.scriptId, desiredScript);
  } else {
    await createScript(options.scriptId, options.scriptName, desiredScript);
  }
  if (existingClient) {
    await updateOAuth2Client(options.clientId, desiredClient);
  } else {
    await createOAuth2Client(options.clientId, desiredClient);
  }

  // With a wildcard loopback registration, --login-redirect-uri is no
  // longer needed at login time — frodo's own default ephemeral-port
  // listener already matches it. With a fixed redirect URI, the exact same
  // value must be passed at login time too, so it's still shown.
  const loginCommand = resolved.wildcardLoopback
    ? `frodo login --browser --login-client-id ${options.clientId} --type ${deploymentType} <host>`
    : `frodo login --browser --login-client-id ${options.clientId} --login-redirect-uri ${resolved.redirectUri} --type ${deploymentType} <host>`;
  printMessage(`Done. Log in with:\n  ${loginCommand}`, 'info');
  return true;
}
