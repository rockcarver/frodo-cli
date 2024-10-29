import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { Readable } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import {
  type OAuth2ClientExportInterface,
  type OAuth2ClientExportOptions,
  type OAuth2ClientImportOptions,
} from '@rockcarver/frodo-lib/types/ops/OAuth2ClientOps';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';

const {
  getTypedFilename,
  titleCase,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const {
  readOAuth2Clients,
  exportOAuth2Client,
  exportOAuth2Clients,
  deleteOAuth2Client,
  importOAuth2Client,
  importFirstOAuth2Client,
  importOAuth2Clients,
} = frodo.oauth2oidc.client;

/**
 * List OAuth2 clients
 * @param [long=false] list with additional details
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listOAuth2Clients(long = false) {
  try {
    const clients = await readOAuth2Clients();
    clients.sort((a, b) => a._id.localeCompare(b._id));
    if (long) {
      const table = createTable([
        'Client Id',
        'Status',
        'Client Type',
        'Grant Types',
        'Scopes',
        'Redirect URIs',
        // 'Description',
      ]);
      const grantTypesMap = {
        authorization_code: 'Authz Code',
        client_credentials: 'Client Creds',
        refresh_token: 'Refresh Token',
        password: 'ROPC',
        'urn:ietf:params:oauth:grant-type:uma-ticket': 'UMA',
        implicit: 'Implicit',
        'urn:ietf:params:oauth:grant-type:device_code': 'Device Code',
        'urn:ietf:params:oauth:grant-type:saml2-bearer': 'SAML2 Bearer',
        'urn:openid:params:grant-type:ciba': 'CIBA',
        'urn:ietf:params:oauth:grant-type:token-exchange': 'Token Exchange',
        'urn:ietf:params:oauth:grant-type:jwt-bearer': 'JWT Bearer',
      };
      clients.forEach((client) => {
        table.push([
          client._id,
          client.coreOAuth2ClientConfig.status === 'Active'
            ? 'Active'['brightGreen']
            : (client.coreOAuth2ClientConfig.status as string)['brightRed'],
          client.coreOAuth2ClientConfig.clientType,
          (client.advancedOAuth2ClientConfig.grantTypes as Readable<string[]>)
            .map((type) => grantTypesMap[type])
            .join('\n'),
          (client.coreOAuth2ClientConfig.scopes as Readable<string[]>).join(
            '\n'
          ),
          (client.coreOAuth2ClientConfig.redirectionUris as string[]).join(
            '\n'
          ),
          // wordwrap(client.description, 30),
        ]);
      });
      printMessage(table.toString(), 'data');
      return true;
    } else {
      clients.forEach((client) => {
        printMessage(`${client._id}`, 'data');
      });
      return true;
    }
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export OAuth2 client to file
 * @param {string} clientId client id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {OAuth2ClientExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2ClientToFile(
  clientId: string,
  file: string,
  includeMeta: boolean = true,
  options: OAuth2ClientExportOptions = {
    useStringArrays: true,
    deps: true,
  }
): Promise<boolean> {
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientToFile: begin`);
  showSpinner(`Exporting ${clientId}...`);
  try {
    let fileName = getTypedFilename(clientId, 'oauth2.app');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportOAuth2Client(clientId, options);
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(`Exported ${clientId} to ${filePath}.`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting ${clientId}`);
    printError(error);
  }
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientToFile: end`);
  return false;
}

/**
 * Export all OAuth2 clients to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {OAuth2ClientExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2ClientsToFile(
  file: string,
  includeMeta: boolean = true,
  options: OAuth2ClientExportOptions = {
    useStringArrays: true,
    deps: true,
  }
): Promise<boolean> {
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientsToFile: begin`);
  showSpinner(`Exporting all clients...`);
  try {
    let fileName = getTypedFilename(
      `all${titleCase(frodo.utils.getRealmName(state.getRealm()))}Applications`,
      'oauth2.app'
    );
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportOAuth2Clients(options);
    saveJsonToFile(exportData, filePath, includeMeta);
    succeedSpinner(`Exported all clients to ${filePath}.`);
    debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientsToFile: end]`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting all clients`);
    printError(error);
  }
  return false;
}

/**
 * Export all OAuth2 clients to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {OAuth2ClientExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2ClientsToFiles(
  includeMeta: boolean = true,
  options: OAuth2ClientExportOptions = {
    useStringArrays: true,
    deps: true,
  }
): Promise<boolean> {
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientsToFiles: begin`);
  const errors = [];
  let indicatorId: string;
  try {
    const clients = await readOAuth2Clients();
    indicatorId = createProgressIndicator(
      'determinate',
      clients.length,
      'Exporting clients...'
    );
    for (const client of clients) {
      const file = getTypedFilename(client._id, 'oauth2.app');
      try {
        const exportData: OAuth2ClientExportInterface =
          await exportOAuth2Client(client._id, options);
        saveJsonToFile(exportData, getFilePath(file, true), includeMeta);
        updateProgressIndicator(indicatorId, `Exported ${client._id}.`);
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(indicatorId, `Error exporting ${client._id}.`);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting oauth2 clients`, errors);
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
    debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientsToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting client(s) to file(s)`);
    printError(error);
  }
  return false;
}

/**
 * Import first OAuth2 client from file
 * @param {string} clientId client id
 * @param {string} file file name
 * @param {OAuth2ClientImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importOAuth2ClientFromFile(
  clientId: string,
  file: string,
  options: OAuth2ClientImportOptions = { deps: true }
): Promise<boolean> {
  debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientFromFile: begin`);
  showSpinner(`Importing ${clientId}...`);
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await importOAuth2Client(clientId, fileData, options);
    succeedSpinner(`Imported ${clientId}.`);
    debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${clientId}.`);
    printError(error);
  }
  return false;
}

/**
 * Import first OAuth2 client from file
 * @param {string} file file name
 * @param {OAuth2ClientImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstOAuth2ClientFromFile(
  file: string,
  options: OAuth2ClientImportOptions = { deps: true }
): Promise<boolean> {
  debugMessage(`cli.OAuth2ClientOps.importFirstOAuth2ClientFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstOAuth2Client(fileData, options);
    succeedSpinner(`Imported ${filePath}.`);
    debugMessage(`cli.OAuth2ClientOps.importFirstOAuth2ClientFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${filePath}.`);
    printError(error);
  }
  return false;
}

/**
 * Import OAuth2 clients from file
 * @param {string} file file name
 * @param {OAuth2ClientImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importOAuth2ClientsFromFile(
  file: string,
  options: OAuth2ClientImportOptions = { deps: true }
): Promise<boolean> {
  debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const clientData = JSON.parse(data);
    await importOAuth2Clients(clientData, options);
    succeedSpinner(`Imported ${filePath}.`);
    debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${filePath}.`);
    printError(error);
  }
  return false;
}

/**
 * Import OAuth2 clients from files
 * @param {OAuth2ClientImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importOAuth2ClientsFromFiles(
  options: OAuth2ClientImportOptions = { deps: true }
): Promise<boolean> {
  const errors = [];
  let indicatorId: string;
  try {
    debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.oauth2.app.json'))
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing clients...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: OAuth2ClientExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.application).length;
        total += count;
        await importOAuth2Clients(fileData, options);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} client(s) from ${file}`
        );
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error importing client(s) from ${file}`
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing oauth2 clients`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} client(s) from ${files.length} file(s).`
    );
    debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing oauth2 clients.`);
    printError(error);
  }
  return false;
}

/**
 * Delete oauth2 client by id
 * @param {String} id script id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteOauth2ClientById(
  clientId: string
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${clientId}...`
  );
  try {
    await deleteOAuth2Client(clientId);
    stopProgressIndicator(spinnerId, `Deleted ${clientId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}
