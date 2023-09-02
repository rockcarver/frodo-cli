import { frodo, state } from '@rockcarver/frodo-lib';
import { ReadableStrings } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import type {
  OAuth2ClientExportInterface,
  OAuth2ClientExportOptions,
  OAuth2ClientImportOptions,
} from '@rockcarver/frodo-lib/types/ops/OAuth2ClientOps';
import fs from 'fs';

import {
  createProgressBar,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressBar,
  succeedSpinner,
  updateProgressBar,
} from '../utils/Console';
import { saveJsonToFile } from '../utils/ExportImportUtils';

const { getTypedFilename, titleCase } = frodo.utils;
const {
  readOAuth2Clients,
  exportOAuth2Client,
  exportOAuth2Clients,
  importOAuth2Client,
  importFirstOAuth2Client,
  importOAuth2Clients,
} = frodo.oauth2oidc.client;

/**
 * List OAuth2 clients
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
          (client.advancedOAuth2ClientConfig.grantTypes as ReadableStrings)
            .map((type) => grantTypesMap[type])
            .join('\n'),
          (client.coreOAuth2ClientConfig.scopes as ReadableStrings).join('\n'),
          (client.coreOAuth2ClientConfig.redirectionUris as string[]).join(
            '\n'
          ),
          // wordwrap(client.description, 30),
        ]);
      });
      printMessage(table.toString(), 'data');
    } else {
      clients.forEach((client) => {
        printMessage(`${client._id}`, 'data');
      });
    }
  } catch (error) {
    printMessage(`Error listing oauth2 clients - ${error}`, 'error');
  }
}

/**
 * Export OAuth2 client to file
 * @param {string} clientId client id
 * @param {string} file file name
 * @param {OAuth2ClientExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2ClientToFile(
  clientId: string,
  file: string,
  options: OAuth2ClientExportOptions = { useStringArrays: true, deps: true }
) {
  let outcome = false;
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientToFile: begin`);
  showSpinner(`Exporting ${clientId}...`);
  try {
    let fileName = getTypedFilename(clientId, 'oauth2.app');
    if (file) {
      fileName = file;
    }
    const exportData = await exportOAuth2Client(clientId, options);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported ${clientId} to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting ${clientId}: ${error.message}`);
  }
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientToFile: end`);
  return outcome;
}

/**
 * Export all OAuth2 clients to file
 * @param {string} file file name
 * @param {OAuth2ClientExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2ClientsToFile(
  file: string,
  options: OAuth2ClientExportOptions = { useStringArrays: true, deps: true }
): Promise<boolean> {
  let outcome = false;
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
    const exportData = await exportOAuth2Clients(options);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported all clients to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting all clients`);
    printMessage(`${error.message}`, 'error');
  }
  debugMessage(
    `cli.OAuth2ClientOps.exportOAuth2ClientsToFile: end [${outcome}]`
  );
  return outcome;
}

/**
 * Export all OAuth2 clients to separate files
 * @param {OAuth2ClientExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportOAuth2ClientsToFiles(
  options: OAuth2ClientExportOptions = { useStringArrays: true, deps: true }
) {
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientsToFiles: begin`);
  const errors = [];
  try {
    const clients = await readOAuth2Clients();
    createProgressBar(clients.length, 'Exporting clients...');
    for (const client of clients) {
      const file = getTypedFilename(client._id, 'oauth2.app');
      try {
        const exportData: OAuth2ClientExportInterface =
          await exportOAuth2Client(client._id, options);
        saveJsonToFile(exportData, file);
        updateProgressBar(`Exported ${client._id}.`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error exporting ${client._id}.`);
      }
    }
    stopProgressBar(`Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error exporting client(s) to file(s)`);
  }
  debugMessage(`cli.OAuth2ClientOps.exportOAuth2ClientsToFiles: end`);
  return 0 === errors.length;
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
  let outcome = false;
  debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientFromFile: begin`);
  showSpinner(`Importing ${clientId}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importOAuth2Client(clientId, fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${clientId}.`);
  } catch (error) {
    failSpinner(`Error importing ${clientId}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientFromFile: end`);
  return outcome;
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
  let outcome = false;
  debugMessage(`cli.OAuth2ClientOps.importFirstOAuth2ClientFromFile: begin`);
  showSpinner(`Importing ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstOAuth2Client(fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${file}.`);
  } catch (error) {
    failSpinner(`Error importing ${file}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.OAuth2ClientOps.importFirstOAuth2ClientFromFile: end`);
  return outcome;
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
  let outcome = false;
  debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFile: begin`);
  showSpinner(`Importing ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const clientData = JSON.parse(data);
    await importOAuth2Clients(clientData, options);
    outcome = true;
    succeedSpinner(`Imported ${file}.`);
  } catch (error) {
    failSpinner(`Error importing ${file}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFile: end`);
  return outcome;
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
  try {
    debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFiles: begin`);
    const names = fs.readdirSync('.');
    const files = names.filter((name) =>
      name.toLowerCase().endsWith('.oauth2.app.json')
    );
    createProgressBar(files.length, 'Importing clients...');
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: OAuth2ClientExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.application).length;
        total += count;
        await importOAuth2Clients(fileData, options);
        updateProgressBar(`Imported ${count} client(s) from ${file}`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error importing client(s) from ${file}`);
        printMessage(error, 'error');
      }
    }
    stopProgressBar(
      `Finished importing ${total} client(s) from ${files.length} file(s).`
    );
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error importing client(s) from file(s).`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.OAuth2ClientOps.importOAuth2ClientsFromFiles: end`);
  return 0 === errors.length;
}
