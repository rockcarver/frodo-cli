import {
  frodo,
  FrodoError,
  state,
  type RemoteProxySkeleton,
  type RemoteProxyTestResult,
} from '@rockcarver/frodo-lib';
import {
  checkBulkDelete,
  checkProceed,
  confirmBulkDelete,
  confirmProceed,
} from '../utils/BulkDeleteGuard';
import c from '../utils/ColorTheme';
import {
  createTable,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  succeedSpinner,
} from '../utils/Console';
import { findSavedProfileByHostName } from '../utils/SavedProfiles';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { remoteProxy } = frodo.idm;

/** A second, separately authenticated instance of the library: the receiving tenant. */
type Tenant = ReturnType<typeof frodo.createInstance>;

/** Seconds to wait for the ESV changes to be applied and the proxy to answer, as `esv apply` does. */
export const DEFAULT_TIMEOUT_SECONDS = 600;
/** Seconds between two checks of the proxy while it loads. */
const POLL_INTERVAL_SECONDS = 10;

/**
 * The identity the OAuth2 client of a remote proxy gets on the receiving
 * tenant: the documented static user mapping to the IDM administrator. It is
 * stated in the help of `setup`, because it is admin-equivalent access.
 */
export const ADMIN_STATIC_MAPPING = {
  localUser: 'internal/user/openidm-admin',
  userRoles: 'authzRoles/*',
  roles: ['internal/role/openidm-authorized', 'internal/role/openidm-admin'],
};

/** What the workflow needs from the clock and the console, replaceable in tests. */
export type WorkflowDeps = {
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
};

const realSleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * The name of a tenant in its URL: `https://openam-zion.id.forgerock.io/am`
 * is `zion`.
 * @param {string} host URL of the tenant
 * @returns {string} the name of the tenant
 */
export function tenantNameOf(host: string): string {
  const hostname = new URL(host).hostname;
  return hostname.split('.')[0].replace(/^openam-/, '');
}

/**
 * The host name in a tenant URL (no scheme, no path), which the ESV variable
 * of a remote proxy holds.
 * @param {string} host URL of the tenant
 * @returns {string} the host name
 */
export function hostNameOf(host: string): string {
  return new URL(host).host;
}

/**
 * The ids of the ESV secret and the ESV variable that belong to a remote
 * proxy: the secret holds the client secret, the variable the host name of the
 * receiving tenant. Both follow from the name of the proxy, so `teardown`
 * finds what `setup` made.
 * @param {string} proxyId name of the remote proxy
 * @returns {{secretId: string, hostVariableId: string}} the ESV ids
 */
export function remoteProxyEsvIds(proxyId: string): {
  secretId: string;
  hostVariableId: string;
} {
  const slug = proxyId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new FrodoError(
      `The name "${proxyId}" has no letters or digits to build the ids of the ESV secret and variable from`
    );
  }
  const secretId = `esv-remote-proxy-${slug}`;
  return { secretId, hostVariableId: `${secretId}-host` };
}

/** True for the error of a read that found nothing. */
function isNotFound(error: unknown): boolean {
  return (error as { httpStatus?: number })?.httpStatus === 404;
}

/**
 * Run a read and answer undefined when there is nothing to read.
 * @param {() => Promise<T>} read the read
 * @returns {Promise<T | undefined>} what was read, or undefined for "not found"
 */
async function readIfExists<T>(read: () => Promise<T>): Promise<T | undefined> {
  try {
    return await read();
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

/**
 * Open the receiving tenant: a second instance of the library for a saved
 * connection profile, logged in without the token cache (as the `--target` of
 * the ESV commands does).
 * @param {string} target host URL, alias or unique part of the receiving tenant
 * @returns {Promise<Tenant>} the logged-in instance
 */
async function openTenant(target: string): Promise<Tenant> {
  const tenant = frodo.createInstance({ host: target });
  tenant.state.setDebug(state.getDebug());
  tenant.state.setVerbose(state.getVerbose());
  tenant.state.setCurlirize(state.getCurlirize());
  tenant.state.setAllowInsecureConnection(state.getAllowInsecureConnection());
  tenant.state.setUseTokenCache(false);
  try {
    await tenant.login.getTokens(false, false, [CLOUD_DEPLOYMENT_TYPE_KEY]);
  } catch (error) {
    throw new FrodoError(
      `Error connecting to the receiving tenant ${target}: it needs a saved connection profile that can log in`,
      error
    );
  }
  return tenant;
}

/** One line of the plan of a command: where, what, and what happens to it. */
type PlanLine = { tenant: string; what: string; action: string };

/**
 * Print the plan as a table.
 * @param {PlanLine[]} plan the lines
 * @returns {Promise<boolean>} true, so it can serve as the plan shown before a question
 */
async function showPlan(plan: PlanLine[]): Promise<boolean> {
  const table = createTable([
    c.heading('Tenant'),
    c.heading('What'),
    c.heading('Action'),
  ]);
  for (const line of plan) table.push([line.tenant, line.what, line.action]);
  printMessage(table.toString(), 'data');
  return true;
}

/** The options of `setup`. */
export type SetupRemoteProxyOptions = {
  /** host URL, alias or unique part of the receiving tenant (a saved connection profile) */
  target: string;
  /** name of the remote proxy; default: the name of the receiving tenant */
  proxyId?: string;
  /** id of the OAuth2 client on the receiving tenant; default: frodo-remote-proxy-<name of the sending tenant> */
  clientId?: string;
  /** realm of the client on the receiving tenant; default: alpha */
  targetRealm?: string;
  /** write a new secret to the client and the ESV secret even if both exist */
  rotateSecret?: boolean;
  /** apply the ESV changes (default true) */
  apply?: boolean;
  /** wait for the apply and for the proxy to answer (default true) */
  wait?: boolean;
  /** seconds to wait */
  timeout?: number;
  dryRun?: boolean;
  yes?: boolean;
};

/**
 * Check the options of a command that must not run without a question before
 * anything else happens (before the login, which a refused run does not need).
 * @param {SetupRemoteProxyOptions} options the options of `setup`
 * @returns {boolean} false, after printing the reason, if the command is refused
 */
export function checkSetupAllowed(
  options: Pick<SetupRemoteProxyOptions, 'yes' | 'dryRun'>
): boolean {
  return checkProceed({
    what: 'set up a remote proxy',
    yes: options.yes,
    dryRun: options.dryRun,
  });
}

/**
 * Wait until a remote proxy answers: test it every few seconds, because it
 * is not loaded until the ESV changes it needs are applied, and a new one takes
 * up to about half a minute to load.
 * @param {string} proxyId name of the remote proxy
 * @param {number} timeoutSeconds seconds to wait
 * @param {WorkflowDeps} deps clock
 * @returns {Promise<RemoteProxyTestResult>} the last result of the test
 */
export async function waitUntilRemoteProxyAnswers(
  proxyId: string,
  timeoutSeconds: number,
  deps: WorkflowDeps = {}
): Promise<RemoteProxyTestResult> {
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const deadline = now() + timeoutSeconds * 1000;
  showSpinner(`Waiting for the remote proxy "${proxyId}" to answer...`);
  let result = await remoteProxy.testRemoteProxy(proxyId);
  while (!result.ok && now() + POLL_INTERVAL_SECONDS * 1000 <= deadline) {
    await sleep(POLL_INTERVAL_SECONDS * 1000);
    result = await remoteProxy.testRemoteProxy(proxyId);
  }
  if (result.ok) {
    succeedSpinner(`The remote proxy "${proxyId}" answers.`);
  } else {
    failSpinner(
      `The remote proxy "${proxyId}" does not answer yet: ${result.message}`
    );
  }
  return result;
}

/**
 * Set up a remote proxy from this tenant (the sending tenant) to another one
 * (the receiving tenant), the whole workflow in one command. Safe to run again:
 * it completes what is missing and leaves what exists as it is.
 *
 * On the receiving tenant: an OAuth2 client (client credentials, scope
 * `fr:idm:*`) with a generated secret, and the static user mapping that lets it
 * act as the IDM administrator. On this tenant: an ESV secret that holds the
 * secret, an ESV variable that holds the host name of the receiving tenant, the
 * remote proxy configuration that refers to both by placeholder (so it can be
 * promoted), one apply of the ESV changes, and a test through the proxy until
 * it answers.
 *
 * The generated secret lives in memory only: it is never printed or logged.
 * @param {SetupRemoteProxyOptions} options the options of `setup`
 * @param {WorkflowDeps} deps clock, replaceable in tests
 * @returns {Promise<boolean>} true if the remote proxy is set up (or the plan was shown for a dry run), false otherwise
 */
export async function setupRemoteProxy(
  options: SetupRemoteProxyOptions,
  deps: WorkflowDeps = {}
): Promise<boolean> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT_SECONDS;
  const apply = options.apply !== false;
  const wait = options.wait !== false;
  const targetRealm = options.targetRealm ?? 'alpha';
  try {
    const receiver = await openTenant(options.target);
    const senderHost = state.getHost();
    const receiverHost = receiver.state.getHost();
    const senderName = tenantNameOf(senderHost);
    const proxyId = options.proxyId ?? tenantNameOf(receiverHost);
    const clientId = options.clientId ?? `frodo-remote-proxy-${senderName}`;
    if (!remoteProxy.isValidRemoteProxyName(proxyId)) {
      throw new FrodoError(
        `The remote proxy name "${proxyId}" is not allowed: use 1 to 100 letters, digits, ".", "_" and "-", starting with a letter or a digit`
      );
    }
    if (senderHost.replace(/\/+$/, '') === receiverHost.replace(/\/+$/, '')) {
      throw new FrodoError(
        'The receiving tenant is the tenant this command is logged in to: a remote proxy connects two different tenants'
      );
    }
    const { secretId, hostVariableId } = remoteProxyEsvIds(proxyId);
    const hostName = hostNameOf(receiverHost);

    // what exists already
    const client = await readIfExists(() =>
      receiver.oauth2oidc.client.readOAuth2Client(clientId)
    );
    const mappings =
      await receiver.idm.staticUserMapping.readStaticUserMappings();
    const mapping = mappings.find((m) => m.subject === clientId);
    const secret = await readIfExists(() =>
      frodo.cloud.secret.readSecret(secretId)
    );
    const variable = await readIfExists(() =>
      frodo.cloud.variable.readVariable(hostVariableId)
    );
    const existingProxy = await readIfExists(() =>
      remoteProxy.readRemoteProxy(proxyId)
    );
    const configuration: RemoteProxySkeleton =
      remoteProxy.buildRemoteProxyConfiguration({
        receiverHost,
        clientId,
        secretId,
        hostVariableId,
        realm: targetRealm,
      });
    const proxyUpToDate =
      existingProxy !== undefined &&
      (
        [
          'enabled',
          'authType',
          'instanceUrl',
          'clientId',
          'clientSecret',
          'tokenEndpoint',
          'tokenEndpointAuthMethod',
        ] as const
      ).every((key) => existingProxy[key] === configuration[key]);
    // a new secret is written when either side of it is missing, or when asked
    const newSecret = !!options.rotateSecret || !client || !secret;

    const plan: PlanLine[] = [
      {
        tenant: receiverHost,
        what: `OAuth2 client "${clientId}"`,
        action: !client ? 'create' : newSecret ? 'new secret' : 'keep (exists)',
      },
      {
        tenant: receiverHost,
        what: `static user mapping of "${clientId}" (IDM administrator)`,
        action: mapping ? 'keep or complete (exists)' : 'create',
      },
      {
        tenant: senderHost,
        what: `ESV secret "${secretId}"`,
        action: !secret ? 'create' : newSecret ? 'new value' : 'keep (exists)',
      },
      {
        tenant: senderHost,
        what: `ESV variable "${hostVariableId}" = ${hostName}`,
        action: !variable
          ? 'create'
          : variable.value !== hostName
            ? 'update'
            : 'keep (exists)',
      },
      {
        tenant: senderHost,
        what: `remote proxy "${proxyId}"`,
        action: !existingProxy
          ? 'create'
          : proxyUpToDate
            ? 'keep (exists)'
            : 'update',
      },
      {
        tenant: senderHost,
        what: 'ESV apply and test through the proxy',
        action: apply ? (wait ? 'apply, wait, test' : 'apply') : 'skipped',
      },
    ];

    if (options.dryRun) {
      await showPlan(plan);
      printMessage('Dry run: nothing was changed.', 'info');
      return true;
    }
    const go = await confirmProceed({
      what: `set up the remote proxy "${proxyId}" from ${senderHost} to ${receiverHost}`,
      yes: options.yes,
      warning: `This gives the OAuth2 client "${clientId}" on ${receiverHost} the rights of the IDM administrator, and keeps its secret in an ESV secret on ${senderHost}. Applying ESV changes restarts services on ${senderHost} and can take up to 10 minutes.`,
      showPlan: () => showPlan(plan),
    });
    if (!go) return false;

    // the receiving tenant: the client and its mapping
    const generated = newSecret
      ? remoteProxy.generateRemoteProxySecret()
      : undefined;
    if (!client) {
      await receiver.oauth2oidc.client.createOAuth2Client(
        clientId,
        remoteProxy.buildRemoteProxyClient({
          clientId,
          clientSecret: generated!,
          description: `Remote proxy from ${senderName}`,
        })
      );
      printMessage(`Created OAuth2 client "${clientId}".`, 'info');
    } else if (generated) {
      client.coreOAuth2ClientConfig = {
        ...client.coreOAuth2ClientConfig,
        userpassword: generated,
      };
      await receiver.oauth2oidc.client.updateOAuth2Client(clientId, client);
      printMessage(`Set a new secret on OAuth2 client "${clientId}".`, 'info');
    }
    const ensured =
      await receiver.idm.staticUserMapping.ensureStaticUserMapping({
        subject: clientId,
        ...ADMIN_STATIC_MAPPING,
      });
    printMessage(
      `Static user mapping of "${clientId}": ${ensured.outcome}.`,
      'info'
    );

    // this tenant: the ESV secret and variable, and the remote proxy
    if (!secret) {
      await frodo.cloud.secret.createSecret(
        secretId,
        generated!,
        `Client secret of the remote proxy ${proxyId}`,
        'generic',
        true
      );
      printMessage(`Created ESV secret "${secretId}".`, 'info');
    } else if (generated) {
      await frodo.cloud.secret.updateSecret(secretId, undefined, generated);
      printMessage(`Set a new value of ESV secret "${secretId}".`, 'info');
    }
    if (!variable) {
      await frodo.cloud.variable.createVariable(
        hostVariableId,
        hostName,
        `Host name of the receiving tenant of the remote proxy ${proxyId}`,
        'string'
      );
      printMessage(`Created ESV variable "${hostVariableId}".`, 'info');
    } else if (variable.value !== hostName) {
      await frodo.cloud.variable.updateVariable(hostVariableId, hostName);
      printMessage(`Updated ESV variable "${hostVariableId}".`, 'info');
    }
    if (!existingProxy) {
      await remoteProxy.createRemoteProxy(proxyId, configuration);
      printMessage(`Created remote proxy "${proxyId}".`, 'info');
    } else if (!proxyUpToDate) {
      await remoteProxy.updateRemoteProxy(proxyId, configuration);
      printMessage(`Updated remote proxy "${proxyId}".`, 'info');
    }

    // apply the ESV changes: IDM does not load a proxy whose placeholders it cannot resolve
    const nextSteps = `Apply the ESV changes (frodo esv apply), then check the proxy with frodo idm remote-proxy test -i ${proxyId}.`;
    if (!apply) {
      printMessage(`The ESV changes are not applied. ${nextSteps}`, 'info');
      return true;
    }
    const updates = await frodo.cloud.startup.checkForUpdates();
    const pending = [...(updates.secrets ?? []), ...(updates.variables ?? [])]
      .filter((item) => !item['loaded'])
      .map((item) => item['_id'] as string);
    const others = pending.filter(
      (id) => id !== secretId && id !== hostVariableId
    );
    if (others.length > 0) {
      printMessage(
        `Other ESV changes are pending on ${senderHost} (${others.join(', ')}). Applying would apply them too, so they were not applied. Review them, then ${nextSteps.charAt(0).toLowerCase()}${nextSteps.slice(1)}`,
        'warn'
      );
      return false;
    }
    if (pending.length > 0) {
      printMessage(
        `Applying the ESV changes on ${senderHost}. This restarts services and can take up to 10 minutes.`,
        'info'
      );
      if (!(await frodo.cloud.startup.applyUpdates(wait, timeout * 1000))) {
        printMessage(`The ESV changes were not applied. ${nextSteps}`, 'error');
        return false;
      }
    }
    if (!wait) {
      printMessage(
        `The ESV changes are being applied. When they are done, check the proxy with frodo idm remote-proxy test -i ${proxyId}.`,
        'info'
      );
      return true;
    }

    const result = await waitUntilRemoteProxyAnswers(proxyId, timeout, deps);
    if (!result.ok) {
      printMessage(
        `The remote proxy "${proxyId}" is set up but does not answer yet. Check it with frodo idm remote-proxy test -i ${proxyId}.`,
        'error'
      );
      return false;
    }
    const table = createTable([c.heading('Property'), c.heading('Value')]);
    table.push(['Remote proxy', proxyId]);
    table.push(['Receiving tenant', receiverHost]);
    table.push(['Acts as', result.authenticationId ?? '']);
    table.push(['Roles', (result.roles ?? []).join(', ')]);
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/** The options of `teardown`. */
export type TeardownRemoteProxyOptions = {
  /** name of the remote proxy */
  proxyId: string;
  /** host URL, alias or unique part of the receiving tenant; default: found from the host name the proxy's ESV variable holds */
  target?: string;
  /** leave the receiving tenant alone: its OAuth2 client and static user mapping stay */
  keepClient?: boolean;
  /** seconds to keep retrying a delete that IDM refuses while the proxy configuration still counts as using it */
  timeout?: number;
  dryRun?: boolean;
  yes?: boolean;
};

/** Seconds between two attempts to delete an ESV secret or variable the removed proxy still seems to use. */
const DELETE_RETRY_SECONDS = 15;
/** Seconds `teardown` keeps retrying such a delete (IDM refused for about 77 s when measured). */
export const DEFAULT_TEARDOWN_TIMEOUT_SECONDS = 300;

/**
 * Refuse a teardown that nobody can be asked about, before anything else
 * happens: it removes things on two tenants, so without a terminal and without
 * `--yes` it is an error that names `--yes` and `--dry-run` (cli record 0037).
 * @param {Pick<TeardownRemoteProxyOptions, 'yes' | 'dryRun'>} options the options of `teardown`
 * @returns {boolean} false, after printing the reason, if the command is refused
 */
export function checkTeardownAllowed(
  options: Pick<TeardownRemoteProxyOptions, 'yes' | 'dryRun'>
): boolean {
  return checkBulkDelete({
    what: 'a remote proxy with the ESV secret and variable it uses and its OAuth2 client',
    yes: options.yes,
    dryRun: options.dryRun,
  });
}

/**
 * All the text an error carries. The reason IDM gives for a refusal is not in
 * `message` of the library's error ("Error deleting variable X"): it is in the
 * combined message and the HTTP message of the error it wraps.
 * @param {unknown} error the error
 * @returns {string} its texts, joined
 */
function errorText(error: unknown): string {
  const e = error as {
    message?: string;
    httpMessage?: string;
    httpDetail?: string;
    getCombinedMessage?: () => string;
  };
  const parts = [e?.message ?? String(error)];
  if (typeof e?.getCombinedMessage === 'function') {
    try {
      parts.push(e.getCombinedMessage());
    } catch {
      // the other texts are enough
    }
  }
  parts.push(e?.httpMessage ?? '', e?.httpDetail ?? '');
  return parts.join(' ');
}

/**
 * Delete something that IDM refuses to delete for a while after the
 * configuration that used it was deleted ("Cannot delete a variable that has an
 * existing config placeholder"): try again every few seconds until the
 * deadline. Any other error is final.
 * @param {() => Promise<unknown>} remove the delete
 * @param {number} timeoutSeconds seconds to keep trying
 * @param {WorkflowDeps} deps clock
 * @returns {Promise<void>} resolves when the delete worked
 */
async function deleteWhenUnused(
  remove: () => Promise<unknown>,
  timeoutSeconds: number,
  deps: WorkflowDeps
): Promise<void> {
  const sleep = deps.sleep ?? realSleep;
  const now = deps.now ?? Date.now;
  const deadline = now() + timeoutSeconds * 1000;
  for (;;) {
    try {
      await remove();
      return;
    } catch (error) {
      const stillUsed = /placeholder|in use|referenc/i.test(errorText(error));
      if (!stillUsed || now() + DELETE_RETRY_SECONDS * 1000 > deadline) {
        throw error;
      }
      await sleep(DELETE_RETRY_SECONDS * 1000);
    }
  }
}

/**
 * Take a remote proxy down again, in the reverse order of `setup`. On this
 * tenant: the remote proxy configuration, then the ESV secret and variable it
 * used (IDM refuses to delete them for a short while after the configuration is
 * gone, so the delete is retried). On the receiving tenant: the static user
 * mapping and the OAuth2 client, unless `--keep-client` leaves that tenant
 * alone or another remote proxy still uses the client. Safe to run again: what
 * is already gone is skipped.
 * @param {TeardownRemoteProxyOptions} options the options of `teardown`
 * @param {WorkflowDeps} deps clock, replaceable in tests
 * @returns {Promise<boolean>} true if everything is removed (or the plan was shown for a dry run), false otherwise
 */
export async function teardownRemoteProxy(
  options: TeardownRemoteProxyOptions,
  deps: WorkflowDeps = {}
): Promise<boolean> {
  const timeout = options.timeout ?? DEFAULT_TEARDOWN_TIMEOUT_SECONDS;
  const { proxyId } = options;
  try {
    if (!remoteProxy.isValidRemoteProxyName(proxyId)) {
      throw new FrodoError(
        `The remote proxy name "${proxyId}" is not allowed: use 1 to 100 letters, digits, ".", "_" and "-", starting with a letter or a digit`
      );
    }
    const senderHost = state.getHost();
    const { secretId, hostVariableId } = remoteProxyEsvIds(proxyId);
    const proxy = await readIfExists(() =>
      remoteProxy.readRemoteProxy(proxyId)
    );
    const secret = await readIfExists(() =>
      frodo.cloud.secret.readSecret(secretId)
    );
    const variable = await readIfExists(() =>
      frodo.cloud.variable.readVariable(hostVariableId)
    );
    if (!proxy && !secret && !variable) {
      printMessage(
        `Nothing to remove: there is no remote proxy "${proxyId}" on ${senderHost}, and no ESV secret "${secretId}" or variable "${hostVariableId}".`,
        'info'
      );
      return true;
    }

    // the receiving tenant, if there is a client to remove there
    const clientId = proxy?.clientId;
    let receiver: Tenant | undefined;
    let receiverHost = '';
    let clientExists = false;
    let mappingExists = false;
    let keepClientBecause = options.keepClient
      ? 'kept: --keep-client'
      : clientId
        ? ''
        : 'not touched: the proxy is gone, so its client is not known';
    if (!keepClientBecause && clientId) {
      const target =
        options.target ??
        (variable?.value
          ? findSavedProfileByHostName(variable.value)?.host
          : undefined);
      if (!target) {
        throw new FrodoError(
          'Cannot tell which tenant is the receiving tenant of this remote proxy: give --target, or --keep-client to leave the receiving tenant alone'
        );
      }
      receiver = await openTenant(target);
      receiverHost = receiver.state.getHost();
      clientExists = !!(await readIfExists(() =>
        receiver!.oauth2oidc.client.readOAuth2Client(clientId)
      ));
      mappingExists = (
        await receiver.idm.staticUserMapping.readStaticUserMappings()
      ).some((m) => m.subject === clientId);
      const sharing = (await remoteProxy.readRemoteProxies())
        .filter((p) => p._id !== proxy?._id && p.clientId === clientId)
        .map((p) => (p._id ?? '').replace(/^external\.idm\//, ''));
      if (sharing.length > 0) {
        keepClientBecause = `kept: also used by ${sharing.join(', ')}`;
      }
    }

    const keepClient = !!keepClientBecause;
    const plan: PlanLine[] = [
      {
        tenant: senderHost,
        what: `remote proxy "${proxyId}"`,
        action: proxy ? 'delete' : 'not there',
      },
      {
        tenant: senderHost,
        what: `ESV secret "${secretId}"`,
        action: secret ? 'delete' : 'not there',
      },
      {
        tenant: senderHost,
        what: `ESV variable "${hostVariableId}"`,
        action: variable ? 'delete' : 'not there',
      },
      {
        tenant: receiverHost || 'receiving tenant',
        what: `static user mapping of "${clientId ?? '?'}"`,
        action: keepClient
          ? keepClientBecause
          : mappingExists
            ? 'delete'
            : 'not there',
      },
      {
        tenant: receiverHost || 'receiving tenant',
        what: `OAuth2 client "${clientId ?? '?'}"`,
        action: keepClient
          ? keepClientBecause
          : clientExists
            ? 'delete'
            : 'not there',
      },
    ];
    if (options.dryRun) {
      await showPlan(plan);
      printMessage('Dry run: nothing was changed.', 'info');
      return true;
    }
    const go = await confirmBulkDelete({
      what: `the remote proxy "${proxyId}" with its ESV secret and variable${keepClient ? '' : ` and the OAuth2 client "${clientId}" on ${receiverHost}`}`,
      yes: options.yes,
      showPlan: () => showPlan(plan),
    });
    if (!go) return false;

    // The receiving tenant first, because that cuts the access: deleting the static
    // user mapping stops the proxy at once, while deleting only the client would
    // leave a proxy that holds a token working until the token expires (up to an
    // hour). If this fails midway, the proxy is still there to point at the client,
    // so running teardown again finishes the job.
    if (receiver && !keepClient) {
      if (mappingExists) {
        await receiver.idm.staticUserMapping.deleteStaticUserMapping(clientId!);
        printMessage(
          `Deleted the static user mapping of "${clientId}".`,
          'info'
        );
      }
      if (clientExists) {
        await receiver.oauth2oidc.client.deleteOAuth2Client(clientId!);
        printMessage(`Deleted OAuth2 client "${clientId}".`, 'info');
      }
    } else if (keepClient && clientId) {
      printMessage(
        `The OAuth2 client "${clientId}" and its static user mapping were ${keepClientBecause}: the access it gives on the receiving tenant is still there.`,
        'warn'
      );
    }
    // This tenant: the proxy, so nothing refers to the ESV variable any more; IDM
    // then refuses to delete the variable for about a minute, hence the retries. A
    // secret is not refused. No ESV apply is needed afterwards.
    if (proxy) {
      await remoteProxy.deleteRemoteProxy(proxyId);
      printMessage(`Deleted remote proxy "${proxyId}".`, 'info');
    }
    if (variable) {
      await deleteWhenUnused(
        () => frodo.cloud.variable.deleteVariable(hostVariableId),
        timeout,
        deps
      );
      printMessage(`Deleted ESV variable "${hostVariableId}".`, 'info');
    }
    if (secret) {
      await deleteWhenUnused(
        () => frodo.cloud.secret.deleteSecret(secretId),
        timeout,
        deps
      );
      printMessage(`Deleted ESV secret "${secretId}".`, 'info');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
