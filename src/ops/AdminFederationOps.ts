import fs from 'fs';
import { AdminFederation } from '@rockcarver/frodo-lib';
import {
  createProgressBar,
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
 */
export async function listAdminFederationProviders() {
  try {
    const providers = await getAdminFederationProviders();
    providers.sort((a, b) => a._id.localeCompare(b._id));
    providers.forEach((socialIdentityProvider) => {
      printMessage(`${socialIdentityProvider._id}`, 'data');
    });
  } catch (err) {
    printMessage(`listAdminFederationProviders ERROR: ${err.message}`, 'error');
    printMessage(err, 'error');
  }
}

/**
 * Export provider by id
 * @param {string} providerId provider id/name
 * @param {string} file optional export file name
 */
export async function exportAdminFederationProviderToFile(
  providerId: string,
  file = ''
) {
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
  } catch (err) {
    stopProgressBar(`${err}`);
    printMessage(`${err}`, 'error');
  }
}

/**
 * Export all providers
 * @param {string} file optional export file name
 */
export async function exportAdminFederationProvidersToFile(file = '') {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(`allProviders`, 'admin.federation');
  }
  const fileData = await exportAdminFederationProviders();
  saveJsonToFile(fileData, fileName);
}

/**
 * Export all providers to individual files
 */
export async function exportAdminFederationProvidersToFiles() {
  const allIdpsData = await getAdminFederationProviders();
  // printMessage(allIdpsData, 'data');
  createProgressBar(allIdpsData.length, 'Exporting providers');
  for (const idpData of allIdpsData) {
    updateProgressBar(`Writing provider ${idpData._id}`);
    const fileName = getTypedFilename(idpData._id, 'admin.federation');
    const fileData = await exportAdminFederationProvider(idpData._id);
    saveJsonToFile(fileData, fileName);
  }
  stopProgressBar(`${allIdpsData.length} providers exported.`);
}

/**
 * Import provider by id/name
 * @param {string} providerId provider id/name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if provider was imported successfully, false otherwise
 */
export async function importAdminFederationProviderFromFile(
  providerId: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Importing provider ${providerId} from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
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
  });
  return outcome;
}

/**
 * Import first provider from file
 * @param {String} file import file name
 * @returns {Promise<boolean>} true if first provider was imported successfully, false otherwise
 */
export async function importFirstAdminFederationProviderFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Importing first provider from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      await importFirstAdminFederationProvider(fileData);
      succeedSpinner(`Successfully imported first provider from ${file}.`);
      outcome = true;
    } catch (error) {
      failSpinner(`Error importing first provider from ${file}.`);
      printMessage(error.response?.data || error, 'error');
    }
  });
  return outcome;
}

/**
 * Import all providers from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if all providers were imported successfully, false otherwise
 */
export async function importAdminFederationProvidersFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Importing providers from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      await importAdminFederationProviders(fileData);
      succeedSpinner(`Successfully imported providers from ${file}.`);
      outcome = true;
    } catch (error) {
      failSpinner(`Error importing providers from ${file}.`);
      printMessage(error.response?.data || error, 'error');
    }
  });
  return outcome;
}

/**
 * Import providers from *.idp.json files in current working directory
 */
export async function importAdminFederationProvidersFromFiles() {
  const names = fs.readdirSync('.');
  const jsonFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.admin.federation.json')
  );

  createProgressBar(jsonFiles.length, 'Importing providers...');
  let total = 0;
  for (const file of jsonFiles) {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    const count = Object.keys(fileData.idp).length;
    total += count;
    await importAdminFederationProviders(fileData);
    updateProgressBar(`Imported ${count} provider(s) from ${file}`);
  }
  stopProgressBar(
    `Finished importing ${total} provider(s) from ${jsonFiles.length} file(s).`
  );
}
