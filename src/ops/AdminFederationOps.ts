import fs from 'fs';
import { AdminFederation } from '@rockcarver/frodo-lib';
import {
  createProgressBar,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressBar,
  succeedSpinner,
  updateProgressBar,
} from '../utils/Console';
import { getTypedFilename, saveJsonToFile } from '../utils/ExportImportUtils';

const {
  getAdminFederationProviders,
  exportAdminFederationProvider,
  exportAdminFederationProviders,
  importAdminFederationProvider,
  importFirstAdminFederationProvider,
  importAdminFederationProviders,
} = AdminFederation;

/**
 * List providers
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listAdminFederationProviders(): Promise<boolean> {
  let outcome = false;
  try {
    const providers = await getAdminFederationProviders();
    providers.sort((a, b) => a._id.localeCompare(b._id));
    providers.forEach((socialIdentityProvider) => {
      printMessage(`${socialIdentityProvider._id}`, 'data');
    });
    outcome = true;
  } catch (err) {
    printMessage(`listAdminFederationProviders ERROR: ${err.message}`, 'error');
    printMessage(err, 'error');
  }
  return outcome;
}

/**
 * Export provider by id
 * @param {string} providerId provider id/name
 * @param {string} file optional export file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAdminFederationProviderToFile(
  providerId: string,
  file = ''
): Promise<boolean> {
  let outcome = false;
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(providerId, 'admin.federation');
  }
  createProgressBar(1, `Exporting ${providerId}`);
  try {
    updateProgressBar(`Writing file ${fileName}`);
    const fileData = await exportAdminFederationProvider(providerId);
    saveJsonToFile(fileData, fileName);
    stopProgressBar(
      `Exported ${providerId['brightCyan']} to ${fileName['brightCyan']}.`
    );
    outcome = true;
  } catch (err) {
    stopProgressBar(`${err}`);
    printMessage(`${err}`, 'error');
  }
  return outcome;
}

/**
 * Export all providers
 * @param {string} file optional export file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAdminFederationProvidersToFile(
  file = ''
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Exporting all providers...`);
  try {
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(`allProviders`, 'admin.federation');
    }
    const fileData = await exportAdminFederationProviders();
    saveJsonToFile(fileData, fileName);
    succeedSpinner(`Exported all providers to ${fileName}`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting all providers.`);
    printMessage(error.response?.data || error, 'error');
  }
  return outcome;
}

/**
 * Export all providers to individual files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportAdminFederationProvidersToFiles(): Promise<boolean> {
  let outcome = false;
  try {
    const allIdpsData = await getAdminFederationProviders();
    createProgressBar(allIdpsData.length, 'Exporting providers');
    for (const idpData of allIdpsData) {
      updateProgressBar(`Writing provider ${idpData._id}`);
      const fileName = getTypedFilename(idpData._id, 'admin.federation');
      const fileData = await exportAdminFederationProvider(idpData._id);
      saveJsonToFile(fileData, fileName);
    }
    stopProgressBar(`${allIdpsData.length} providers exported.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting all providers.`);
    printMessage(error.response?.data || error, 'error');
  }
  return outcome;
}

/**
 * Import provider by id/name
 * @param {string} providerId provider id/name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAdminFederationProviderFromFile(
  providerId: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Importing provider ${providerId} from ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importAdminFederationProvider(providerId, fileData);
    succeedSpinner(
      `Successfully imported provider ${providerId} from ${file}.`
    );
    outcome = true;
  } catch (error) {
    failSpinner(`Error importing provider ${providerId} from ${file}.`);
    printMessage(error.response?.data || error, 'error');
  }
  return outcome;
}

/**
 * Import first provider from file
 * @param {String} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstAdminFederationProviderFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(
    `cli.AdminFederationOps.importFirstAdminFederationProviderFromFile: begin`
  );
  showSpinner(`Importing first provider from ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstAdminFederationProvider(fileData);
    succeedSpinner(`Successfully imported first provider from ${file}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error importing first provider from ${file}.`);
    printMessage(error.response?.data || error, 'error');
  }
  debugMessage(
    `cli.AdminFederationOps.importFirstAdminFederationProviderFromFile: end`
  );
  return outcome;
}

/**
 * Import all providers from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAdminFederationProvidersFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  debugMessage(
    `cli.AdminFederationOps.importAdminFederationProvidersFromFile: begin`
  );
  showSpinner(`Importing providers from ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importAdminFederationProviders(fileData);
    succeedSpinner(`Imported providers from ${file}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error importing ${file}.`);
    printMessage(error.response?.data || error, 'error');
  }
  debugMessage(
    `cli.AdminFederationOps.importAdminFederationProvidersFromFile: end`
  );
  return outcome;
}

/**
 * Import providers from *.idp.json files in current working directory
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importAdminFederationProvidersFromFiles(): Promise<boolean> {
  const errors = [];
  try {
    debugMessage(
      `cli.AdminFederationOps.importAdminFederationProvidersFromFiles: begin`
    );
    const names = fs.readdirSync('.');
    const files = names.filter((name) =>
      name.toLowerCase().endsWith('.admin.federation.json')
    );
    createProgressBar(files.length, 'Importing providers...');
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData = JSON.parse(data);
        const count = Object.keys(fileData.idp).length;
        total += count;
        await importAdminFederationProviders(fileData);
        updateProgressBar(`Imported ${count} provider(s) from ${file}`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error importing provider(s) from ${file}`);
        printMessage(error, 'error');
      }
    }
    stopProgressBar(
      `Finished importing ${total} provider(s) from ${files.length} file(s).`
    );
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error importing provider(s) from file(s).`);
    printMessage(error, 'error');
  }
  debugMessage(
    `cli.AdminFederationOps.importAdminFederationProvidersFromFiles: end`
  );
  return 0 === errors.length;
}
