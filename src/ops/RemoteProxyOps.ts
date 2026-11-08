import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type RemoteProxyExportInterface,
  type RemoteProxySkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  createTable,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';

const {
  getTypedFilename,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
  readJsonFile,
} = frodo.utils;
const { remoteProxy } = frodo.idm;

/** Where `config-manager` keeps the remote proxies: one file per proxy, named after it. */
const CONFIG_MANAGER_DIRECTORY = 'remote-proxies';
const REMOTE_PROXY_FILE_TYPE = 'remoteproxy.idm';
const REMOTE_PROXY_FILE_SUFFIX = `.${REMOTE_PROXY_FILE_TYPE}.json`;

/** The properties of a remote proxy that the create and update commands take. */
export type RemoteProxyProperties = {
  authType?: string;
  instanceUrl?: string;
  basicUserName?: string;
  /** a bare flag that nobody resolved arrives as `true` and counts as missing */
  basicPassword?: string | boolean;
  clientId?: string;
  clientSecret?: string | boolean;
  tokenEndpoint?: string;
  scope?: string;
  disabled?: boolean;
  enabled?: boolean;
};

type Secret = RemoteProxySkeleton['password'];

/**
 * The name of a remote proxy: its id without the config entity type.
 * @param {RemoteProxySkeleton} proxy remote proxy
 * @returns {string} the name
 */
function getName(proxy: RemoteProxySkeleton): string {
  return proxy._id.replace(`${remoteProxy.REMOTE_PROXY_TYPE}/`, '');
}

/**
 * Say how a secret is kept, without showing it.
 * @param {Secret} secret the secret as the tenant returns it
 * @returns {string} a short description
 */
function describeSecret(secret: Secret): string {
  if (secret === undefined || secret === null || secret === '') return '';
  if (typeof secret === 'object') return 'encrypted for this tenant';
  return secret.startsWith('&{') ? `ESV placeholder ${secret}` : 'literal';
}

function countProxies(count: number): string {
  return `${count} remote prox${count === 1 ? 'y' : 'ies'}`;
}

function getIdentity(proxy: RemoteProxySkeleton): string {
  return (proxy.authType === 'basic' ? proxy.userName : proxy.clientId) ?? '';
}

function getSecret(proxy: RemoteProxySkeleton): Secret {
  return proxy.authType === 'basic' ? proxy.password : proxy.clientSecret;
}

/**
 * Split the remote proxies into the ones that can be addressed by name and the
 * ones that cannot (IDM keeps entities with names that it cannot read back or
 * delete again), and say so for the latter.
 * @param {RemoteProxySkeleton[]} proxies remote proxies as read from the tenant
 * @returns {RemoteProxySkeleton[]} the ones that can be addressed
 */
function keepAddressable(
  proxies: RemoteProxySkeleton[]
): RemoteProxySkeleton[] {
  const skipped = proxies.filter(
    (proxy) => !remoteProxy.isValidRemoteProxyName(getName(proxy))
  );
  if (skipped.length > 0) {
    printMessage(
      `${skipped.length} remote prox${skipped.length === 1 ? 'y has a name' : 'ies have names'} that cannot be addressed and ${skipped.length === 1 ? 'is' : 'are'} left out: ${skipped
        .map((proxy) => JSON.stringify(getName(proxy)))
        .join(', ')}`,
      'warn'
    );
  }
  return proxies.filter((proxy) => !skipped.includes(proxy));
}

/**
 * The same as keepAddressable, for the proxies of an export.
 * @param {RemoteProxyExportInterface} exportData export data, changed in place
 */
function keepAddressableInExport(exportData: RemoteProxyExportInterface): void {
  const names = Object.keys(exportData.remoteProxy);
  const skipped = names.filter(
    (name) => !remoteProxy.isValidRemoteProxyName(name)
  );
  for (const name of skipped) delete exportData.remoteProxy[name];
  if (skipped.length > 0) {
    printMessage(
      `Left out of the export, because their names cannot be addressed: ${skipped
        .map((name) => JSON.stringify(name))
        .join(', ')}`,
      'warn'
    );
  }
}

/**
 * The remote proxies that hold secrets which only the tenant that encrypted
 * them can decrypt, with the names of those properties.
 * @param {Record<string, RemoteProxySkeleton>} proxies the proxies by name
 * @returns {{ name: string; properties: string[] }[]} the proxies with such secrets
 */
function findTenantBoundSecrets(
  proxies: Record<string, RemoteProxySkeleton>
): { name: string; properties: string[] }[] {
  return Object.entries(proxies)
    .map(([name, proxy]) => ({
      name,
      properties: remoteProxy.getTenantBoundSecrets(proxy),
    }))
    .filter(({ properties }) => properties.length > 0);
}

/**
 * Warn about the secrets of exported remote proxies that only this tenant can
 * decrypt.
 * @param {Record<string, RemoteProxySkeleton>} proxies the exported proxies by name
 */
function warnTenantBoundSecrets(
  proxies: Record<string, RemoteProxySkeleton>
): void {
  const bound = findTenantBoundSecrets(proxies);
  if (bound.length > 0) {
    printMessage(
      `These remote proxies hold secrets that are encrypted for this tenant and cannot be used in another one: ${bound
        .map(({ name, properties }) => `${name} (${properties.join(', ')})`)
        .join(
          ', '
        )}. Use ESV placeholders such as &{esv.zion.proxy.secret} for a configuration that moves between tenants.`,
      'warn'
    );
  }
}

/**
 * Whether two host URLs are the same host.
 * @param {string} a first URL
 * @param {string} b second URL
 * @returns {boolean} true if both are URLs of the same host
 */
function isSameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

/**
 * Warn when an import carries secrets that were encrypted for another tenant:
 * this tenant may be unable to use them.
 * @param {RemoteProxyExportInterface} importData the data to import
 */
function warnForeignSecrets(importData: RemoteProxyExportInterface): void {
  const origin = importData.meta?.origin;
  if (origin && isSameHost(origin, state.getHost())) return;
  const bound = findTenantBoundSecrets(importData.remoteProxy);
  if (bound.length > 0) {
    printMessage(
      `These remote proxies carry secrets that were encrypted for ${origin ? `another tenant (${origin})` : 'an unknown tenant'}, so this tenant may be unable to use them: ${bound
        .map(({ name, properties }) => `${name} (${properties.join(', ')})`)
        .join(', ')}. Use ESV placeholders instead.`,
      'warn'
    );
  }
}

/**
 * Warn about remote proxies that address their receiving tenant with a fixed
 * URL: a promotion carries the address to the next environment unchanged.
 * @param {Record<string, RemoteProxySkeleton>} proxies the proxies by name
 */
function warnFixedHostUrls(proxies: Record<string, RemoteProxySkeleton>): void {
  const fixed = Object.entries(proxies)
    .map(([name, proxy]) => ({
      name,
      properties: remoteProxy.getFixedHostUrls(proxy),
    }))
    .filter(({ properties }) => properties.length > 0);
  if (fixed.length > 0) {
    printMessage(
      `These remote proxies address their receiving tenant with a fixed URL, which a promotion carries to the next environment unchanged: ${fixed
        .map(({ name, properties }) => `${name} (${properties.join(', ')})`)
        .join(
          ', '
        )}. Make the host an ESV placeholder such as https://&{esv.zion.proxy.host}/openidm/ to let each environment supply its own receiver.`,
      'warn'
    );
  }
}

/**
 * List remote proxies
 * @param {boolean} long long format with details
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listRemoteProxies(
  long: boolean = false
): Promise<boolean> {
  let proxies: RemoteProxySkeleton[];
  try {
    proxies = keepAddressable(await remoteProxy.readRemoteProxies());
  } catch (error) {
    printError(error);
    return false;
  }
  proxies.sort((a, b) => getName(a).localeCompare(getName(b)));
  if (!long) {
    for (const proxy of proxies) printMessage(getName(proxy), 'data');
    return true;
  }
  const table = createTable([
    c.heading('Name'),
    c.heading('Status'),
    c.heading('Authentication'),
    c.heading('Instance URL'),
    c.heading('User / Client'),
    c.heading('Secret'),
  ]);
  for (const proxy of proxies) {
    table.push([
      getName(proxy),
      proxy.enabled === false ? c.negative('disabled') : c.positive('enabled'),
      proxy.authType,
      proxy.instanceUrl ?? '',
      getIdentity(proxy),
      describeSecret(getSecret(proxy)),
    ]);
  }
  printMessage(table.toString(), 'data');
  return true;
}

/**
 * Describe a remote proxy
 * @param {string} proxyId name of the remote proxy
 * @param {boolean} json true to print the proxy as IDM returns it
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeRemoteProxy(
  proxyId: string,
  json: boolean = false
): Promise<boolean> {
  try {
    const proxy = await remoteProxy.readRemoteProxy(proxyId);
    if (json) {
      printMessage(JSON.stringify(proxy, null, 2), 'data');
    } else {
      const table = createTable([c.heading('Property'), c.heading('Value')]);
      table.push(['Name', getName(proxy)]);
      table.push([
        'Status',
        proxy.enabled === false
          ? c.negative('disabled')
          : c.positive('enabled'),
      ]);
      table.push(['Authentication', proxy.authType]);
      table.push(['Instance URL', proxy.instanceUrl ?? '']);
      if (proxy.authType === 'basic') {
        table.push(['User name', proxy.userName ?? '']);
        table.push(['Password', describeSecret(proxy.password)]);
      } else {
        table.push(['Client id', proxy.clientId ?? '']);
        table.push(['Client secret', describeSecret(proxy.clientSecret)]);
        table.push(['Token endpoint', proxy.tokenEndpoint ?? '']);
        table.push([
          'Token endpoint authentication',
          proxy.tokenEndpointAuthMethod ?? '',
        ]);
        table.push([
          'Scope',
          (proxy.scope ?? []).join(proxy.scopeDelimiter ?? ' '),
        ]);
      }
      printMessage(table.toString(), 'data');
    }
    const bound = remoteProxy.getTenantBoundSecrets(proxy);
    if (bound.length > 0) {
      printMessage(
        `The ${bound.join(' and ')} of this remote proxy ${bound.length === 1 ? 'is' : 'are'} encrypted for this tenant and cannot be used in another one. Use ESV placeholders such as &{esv.zion.proxy.secret} for a configuration that moves between tenants.`,
        'warn'
      );
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * What to do about each way a remote proxy can fail its test. The library
 * tells the ways apart; these say what the user can do about each one.
 * @param {string} proxyId name of the remote proxy
 * @returns {Record<string, string>} advice by status of the test
 */
function adviceForFailedTest(proxyId: string): Record<string, string> {
  return {
    'not-found': `This tenant has no working remote proxy "${proxyId}". Either it does not exist or IDM has not loaded it: IDM does not load a proxy whose ESV placeholder cannot be resolved, so after creating or changing the ESV secrets and variables it uses, apply them (frodo esv apply) and test again. A new proxy can also take up to about half a minute to load.`,
    unavailable: `The remote proxy "${proxyId}" is disabled or not ready. Enable it with frodo idm remote-proxy update -i ${proxyId} --enabled, or test again in a moment.`,
    'token-request-failed':
      'The proxy could not get a token from the receiving tenant. Check that the OAuth2 client exists there, that its secret is the one in the ESV secret the proxy refers to, and that the token endpoint is right.',
    'not-authorized':
      'The receiving tenant issued a token and then refused the request. The OAuth2 client probably has no static user mapping in the IDM authentication configuration of the receiving tenant.',
    unreachable:
      'The receiving tenant did not answer. Check the instance URL of the remote proxy and that the tenant is up.',
  };
}

/**
 * Test a remote proxy: make one read through it to the receiving tenant and
 * say what the answer means. A working proxy shows the identity and roles it
 * is mapped to on the receiving tenant; a failing one is explained. Nothing is
 * changed and no secret is read or printed.
 * @param {string} proxyId name of the remote proxy
 * @param {boolean} json true to print the result as JSON
 * @returns {Promise<boolean>} true if the remote proxy works, false otherwise
 */
export async function testRemoteProxy(
  proxyId: string,
  json: boolean = false
): Promise<boolean> {
  try {
    const result = await remoteProxy.testRemoteProxy(proxyId);
    if (json) {
      printMessage(JSON.stringify(result, null, 2), 'data');
    } else if (result.ok) {
      const table = createTable([c.heading('Property'), c.heading('Value')]);
      table.push(['Remote proxy', proxyId]);
      table.push(['Status', c.positive('works')]);
      table.push(['Acts as', result.authenticationId ?? '']);
      table.push(['Roles', (result.roles ?? []).join(', ')]);
      printMessage(table.toString(), 'data');
    } else {
      printMessage(
        `Remote proxy "${proxyId}" does not work: ${result.message}`,
        'error'
      );
      const advice = adviceForFailedTest(proxyId)[result.status];
      if (advice) printMessage(advice, 'info');
    }
    return result.ok;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export a remote proxy to a file
 * @param {string} proxyId name of the remote proxy
 * @param {string} file optional file name
 * @param {boolean} includeMeta true to include metadata, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportRemoteProxyToFile(
  proxyId: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    const fileName = file || getTypedFilename(proxyId, REMOTE_PROXY_FILE_TYPE);
    const filePath = getFilePath(fileName, true);
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting ${proxyId}`
    );
    const exportData = await remoteProxy.exportRemoteProxy(proxyId);
    updateProgressIndicator(indicatorId, `Writing file ${filePath}`);
    saveJsonToFile(exportData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported ${c.heading(proxyId)} to ${c.heading(filePath)}.`
    );
    warnTenantBoundSecrets(exportData.remoteProxy);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error}`);
    printError(error);
  }
  return false;
}

/**
 * Export all remote proxies to one file
 * @param {string} file optional file name
 * @param {boolean} includeMeta true to include metadata, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportRemoteProxiesToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const fileName =
      file || getTypedFilename('allRemoteProxies', REMOTE_PROXY_FILE_TYPE);
    const filePath = getFilePath(fileName, true);
    const exportData = await remoteProxy.exportRemoteProxies();
    keepAddressableInExport(exportData);
    saveJsonToFile(exportData, filePath, includeMeta);
    printMessage(
      `Exported ${countProxies(Object.keys(exportData.remoteProxy).length)} to ${filePath}.`,
      'info'
    );
    warnTenantBoundSecrets(exportData.remoteProxy);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all remote proxies to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportRemoteProxiesToFiles(
  includeMeta: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    const exportData = await remoteProxy.exportRemoteProxies();
    keepAddressableInExport(exportData);
    const entries = Object.entries(exportData.remoteProxy);
    indicatorId = createProgressIndicator(
      'determinate',
      entries.length,
      'Writing remote proxies'
    );
    for (const [name, proxy] of entries) {
      const fileData = remoteProxy.createRemoteProxyExportTemplate();
      fileData.remoteProxy[name] = proxy;
      updateProgressIndicator(indicatorId, `Exporting ${name}`);
      saveJsonToFile(
        fileData,
        getFilePath(getTypedFilename(name, REMOTE_PROXY_FILE_TYPE), true),
        includeMeta
      );
    }
    stopProgressIndicator(
      indicatorId,
      `${countProxies(entries.length)} written.`
    );
    warnTenantBoundSecrets(exportData.remoteProxy);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error}`);
    printError(error);
  }
  return false;
}

/**
 * Import remote proxies, all of them or none: the library checks every name and
 * every proxy before it sends one.
 * @param {RemoteProxyExportInterface} importData the data to import
 * @param {string} source where the data came from, for the messages
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
async function runImport(
  importData: RemoteProxyExportInterface,
  source: string
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing remote proxies from ${source}...`
  );
  try {
    warnForeignSecrets(importData);
    const imported = await remoteProxy.importRemoteProxies(importData);
    stopProgressIndicator(
      indicatorId,
      `Imported ${countProxies(imported.length)} from ${source}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing remote proxies from ${source}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

function readImportFile(file: string): RemoteProxyExportInterface {
  return JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
}

/**
 * Import one remote proxy from a file
 * @param {string} proxyId name of the remote proxy
 * @param {string} file name of the file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importRemoteProxyFromFile(
  proxyId: string,
  file: string
): Promise<boolean> {
  try {
    const fileData = readImportFile(file);
    if (!fileData.remoteProxy?.[proxyId]) {
      printMessage(
        `Remote proxy ${proxyId} not found in ${getFilePath(file)}!`,
        'error'
      );
      return false;
    }
    return await runImport(
      {
        meta: fileData.meta,
        remoteProxy: { [proxyId]: fileData.remoteProxy[proxyId] },
      },
      file
    );
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import the first remote proxy of a file
 * @param {string} file name of the file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstRemoteProxyFromFile(
  file: string
): Promise<boolean> {
  try {
    const fileData = readImportFile(file);
    const [first] = Object.keys(fileData.remoteProxy ?? {});
    if (!first) {
      printMessage(`No remote proxy found in ${getFilePath(file)}!`, 'error');
      return false;
    }
    return await importRemoteProxyFromFile(first, file);
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import all remote proxies from one file
 * @param {string} file name of the file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importRemoteProxiesFromFile(
  file: string
): Promise<boolean> {
  try {
    return await runImport(readImportFile(file), file);
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import all remote proxies from the separate files of the working directory
 * (`*.remoteproxy.idm.json`) in one go: a file that holds a name or a proxy that
 * the library refuses stops the whole import.
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importRemoteProxiesFromFiles(): Promise<boolean> {
  try {
    const directory = getWorkingDirectory();
    const files = fs
      .readdirSync(directory)
      .filter((name) => name.endsWith(REMOTE_PROXY_FILE_SUFFIX))
      .sort();
    if (files.length === 0) {
      printMessage(
        `No remote proxy files (*${REMOTE_PROXY_FILE_SUFFIX}) found in ${directory}!`,
        'error'
      );
      return false;
    }
    const combined: RemoteProxyExportInterface = { remoteProxy: {} };
    const origins = new Set<string | undefined>();
    for (const file of files) {
      const fileData = JSON.parse(
        fs.readFileSync(path.join(directory, file), 'utf8')
      ) as RemoteProxyExportInterface;
      Object.assign(combined.remoteProxy, fileData.remoteProxy);
      origins.add(fileData.meta?.origin);
      combined.meta ??= fileData.meta;
    }
    // files that do not agree on where they come from have an unknown origin,
    // so that the warning about secrets of another tenant is not lost
    if (origins.size !== 1) combined.meta = undefined;
    return await runImport(combined, `${files.length} files in ${directory}`);
  } catch (error) {
    printError(error);
  }
  return false;
}

function parseScope(scope: string | undefined): string[] | undefined {
  if (scope === undefined) return undefined;
  return scope.split(/[\s,]+/).filter((item) => item.length > 0);
}

/** The value of a secret option, or undefined when it was left out or is a bare flag that nobody resolved. */
function secretValue(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Say that a literal secret is kept for this tenant only. */
function noteLiteralSecrets(secrets: (string | undefined)[]): void {
  if (
    secrets.some((secret) => secret !== undefined && !secret.startsWith('&{'))
  ) {
    printMessage(
      'A literal secret is stored encrypted for this tenant and cannot be moved to another one. Use an ESV placeholder such as &{esv.zion.proxy.secret} for a configuration that moves between tenants.',
      'warn'
    );
  }
}

/**
 * Create a remote proxy
 * @param {string} proxyId name of the remote proxy
 * @param {RemoteProxyProperties} properties the properties of the remote proxy
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createRemoteProxy(
  proxyId: string,
  properties: RemoteProxyProperties
): Promise<boolean> {
  const problems: string[] = [];
  const authType = properties.authType;
  if (authType !== 'basic' && authType !== 'bearer') {
    problems.push(`the authentication type is "basic" or "bearer"`);
  }
  if (!properties.instanceUrl) problems.push('the instance URL is missing');
  const basicPassword = secretValue(properties.basicPassword);
  const clientSecret = secretValue(properties.clientSecret);
  if (authType === 'basic') {
    if (!properties.basicUserName)
      problems.push(
        'basic authentication needs a user name (--basic-user-name)'
      );
    if (!basicPassword)
      problems.push('basic authentication needs a password (--basic-password)');
    for (const [flag, value] of [
      ['--client-id', properties.clientId],
      ['--client-secret', properties.clientSecret],
      ['--token-endpoint', properties.tokenEndpoint],
      ['--scope', properties.scope],
    ]) {
      if (value !== undefined)
        problems.push(`${flag} belongs to bearer authentication`);
    }
  } else if (authType === 'bearer') {
    if (!properties.clientId)
      problems.push('bearer authentication needs a client id (--client-id)');
    if (!clientSecret)
      problems.push(
        'bearer authentication needs a client secret (--client-secret)'
      );
    if (!properties.tokenEndpoint)
      problems.push(
        'bearer authentication needs a token endpoint (--token-endpoint)'
      );
    for (const [flag, value] of [
      ['--basic-user-name', properties.basicUserName],
      ['--basic-password', properties.basicPassword],
    ]) {
      if (value !== undefined)
        problems.push(`${flag} belongs to basic authentication`);
    }
  }
  if (problems.length > 0) {
    printMessage(
      `Cannot create remote proxy ${proxyId}: ${problems.join('; ')}.`,
      'error'
    );
    return false;
  }
  const proxyData: RemoteProxySkeleton =
    authType === 'basic'
      ? {
          _id: `${remoteProxy.REMOTE_PROXY_TYPE}/${proxyId}`,
          enabled: !properties.disabled,
          authType: 'basic',
          instanceUrl: properties.instanceUrl,
          userName: properties.basicUserName,
          password: basicPassword,
        }
      : {
          _id: `${remoteProxy.REMOTE_PROXY_TYPE}/${proxyId}`,
          enabled: !properties.disabled,
          authType: 'bearer',
          instanceUrl: properties.instanceUrl,
          clientId: properties.clientId,
          clientSecret,
          tokenEndpoint: properties.tokenEndpoint,
          tokenEndpointAuthMethod: 'client_secret_post',
          scope: parseScope(properties.scope) ?? [],
          scopeDelimiter: ' ',
        };
  showSpinner(`Creating remote proxy ${proxyId}...`);
  try {
    noteLiteralSecrets([basicPassword, clientSecret]);
    await remoteProxy.createRemoteProxy(proxyId, proxyData);
    succeedSpinner(`Created remote proxy ${proxyId}.`);
    return true;
  } catch (error) {
    failSpinner(`Error creating remote proxy ${proxyId}`);
    printError(error);
  }
  return false;
}

/**
 * Update properties of a remote proxy
 * @param {string} proxyId name of the remote proxy
 * @param {RemoteProxyProperties} properties the properties to change
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function updateRemoteProxy(
  proxyId: string,
  properties: RemoteProxyProperties
): Promise<boolean> {
  try {
    const proxyData = await remoteProxy.readRemoteProxy(proxyId);
    const problems: string[] = [];
    const basicOnly: [string, unknown][] = [
      ['--basic-user-name', properties.basicUserName],
      ['--basic-password', properties.basicPassword],
    ];
    const bearerOnly: [string, unknown][] = [
      ['--client-id', properties.clientId],
      ['--client-secret', properties.clientSecret],
      ['--token-endpoint', properties.tokenEndpoint],
      ['--scope', properties.scope],
    ];
    for (const [flag, value] of proxyData.authType === 'basic'
      ? bearerOnly
      : basicOnly) {
      if (value !== undefined) {
        problems.push(
          `${flag} does not apply: ${proxyId} uses ${proxyData.authType} authentication`
        );
      }
    }
    if (problems.length > 0) {
      printMessage(
        `Cannot update remote proxy ${proxyId}: ${problems.join('; ')}.`,
        'error'
      );
      return false;
    }
    const basicPassword = secretValue(properties.basicPassword);
    const clientSecret = secretValue(properties.clientSecret);
    if (properties.instanceUrl !== undefined)
      proxyData.instanceUrl = properties.instanceUrl;
    if (properties.enabled) proxyData.enabled = true;
    if (properties.disabled) proxyData.enabled = false;
    if (properties.basicUserName !== undefined)
      proxyData.userName = properties.basicUserName;
    if (basicPassword !== undefined) proxyData.password = basicPassword;
    if (properties.clientId !== undefined)
      proxyData.clientId = properties.clientId;
    if (clientSecret !== undefined) proxyData.clientSecret = clientSecret;
    if (properties.tokenEndpoint !== undefined)
      proxyData.tokenEndpoint = properties.tokenEndpoint;
    if (properties.scope !== undefined)
      proxyData.scope = parseScope(properties.scope);
    showSpinner(`Updating remote proxy ${proxyId}...`);
    try {
      noteLiteralSecrets([basicPassword, clientSecret]);
      await remoteProxy.updateRemoteProxy(proxyId, proxyData);
      succeedSpinner(`Updated remote proxy ${proxyId}.`);
      return true;
    } catch (error) {
      failSpinner(`Error updating remote proxy ${proxyId}`);
      throw error;
    }
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Delete a remote proxy
 * @param {string} proxyId name of the remote proxy
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteRemoteProxy(proxyId: string): Promise<boolean> {
  showSpinner(`Deleting ${proxyId}...`);
  try {
    await remoteProxy.deleteRemoteProxy(proxyId);
    succeedSpinner(`Deleted ${proxyId}.`);
    return true;
  } catch (error) {
    failSpinner(`Error deleting remote proxy ${proxyId}`);
    printError(error);
  }
  return false;
}

/**
 * Delete all remote proxies
 * @param {boolean} allowFailures true to report remote proxies that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteRemoteProxies(
  allowFailures = false
): Promise<boolean> {
  showSpinner('Deleting all remote proxies...');
  try {
    const proxies = await remoteProxy.readRemoteProxies();
    const run = new OperationRun({ unit: 'remote proxy', allowFailures });
    for (const proxy of proxies) {
      const name = getName(proxy);
      await run.run(name, async () => {
        await remoteProxy.deleteRemoteProxy(name);
      });
    }
    if (run.hasFailures) {
      failSpinner('Some remote proxies could not be deleted');
    } else {
      succeedSpinner(`Deleted ${countProxies(proxies.length)}.`);
    }
    return run.finish();
  } catch (error) {
    failSpinner('Error deleting all remote proxies');
    printError(error);
  }
  return false;
}

/**
 * Export the remote proxies in fr-config-manager style: one file per proxy,
 * `remote-proxies/<name>.json`, holding the proxy as IDM returns it. Secrets
 * that only this tenant can decrypt are flagged; a tenant without remote proxies
 * writes nothing.
 * @param {string} name optional name: export only that remote proxy
 * @param {boolean} quiet true to say nothing when there is no remote proxy (the step of `pull all`)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportRemoteProxies(
  name?: string,
  quiet: boolean = false
): Promise<boolean> {
  try {
    const proxies = name
      ? [await remoteProxy.readRemoteProxy(name)]
      : keepAddressable(await remoteProxy.readRemoteProxies());
    const written: Record<string, RemoteProxySkeleton> = {};
    for (const proxy of proxies) {
      const proxyName = getName(proxy);
      saveJsonToFile(
        proxy,
        getFilePath(`${CONFIG_MANAGER_DIRECTORY}/${proxyName}.json`, true),
        false,
        true
      );
      written[proxyName] = proxy;
    }
    if (proxies.length === 0 && !quiet) {
      printMessage('No remote proxies found.', 'info');
    }
    warnTenantBoundSecrets(written);
    warnFixedHostUrls(written);
    return true;
  } catch (error) {
    printError(error, 'Error exporting remote proxies');
  }
  return false;
}

/**
 * Import the remote proxies of the files `remote-proxies/<name>.json`. All or
 * none: the library checks every name and proxy before it sends one. A secret
 * that was encrypted by a tenant is imported with a warning, because this tenant
 * may be unable to decrypt it; an ESV placeholder is the portable form.
 * @param {string} name optional name: import only that remote proxy
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportRemoteProxies(
  name?: string
): Promise<boolean> {
  try {
    const directory = getFilePath(CONFIG_MANAGER_DIRECTORY);
    const files = name
      ? [`${name}.json`]
      : fs.existsSync(directory)
        ? fs
            .readdirSync(directory)
            .filter((file) => file.endsWith('.json'))
            .sort()
        : [];
    if (
      files.length === 0 ||
      (name &&
        !fs.existsSync(getFilePath(`${CONFIG_MANAGER_DIRECTORY}/${files[0]}`)))
    ) {
      printMessage(
        name
          ? `Remote proxy file ${files[0]} not found in ${directory}.`
          : `No remote proxy files found in ${directory}.`,
        'error'
      );
      return false;
    }
    const importData: RemoteProxyExportInterface = { remoteProxy: {} };
    for (const file of files) {
      importData.remoteProxy[file.replace(/\.json$/, '')] = readJsonFile(
        getFilePath(`${CONFIG_MANAGER_DIRECTORY}/${file}`)
      ) as RemoteProxySkeleton;
    }
    warnForeignSecrets(importData);
    warnFixedHostUrls(importData.remoteProxy);
    await remoteProxy.importRemoteProxies(importData);
    return true;
  } catch (error) {
    printError(error, 'Error importing remote proxies');
  }
  return false;
}
