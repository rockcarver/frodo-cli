import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';
import type { SocialIdpSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
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
import {
  getRealmString,
  getTypedFilename,
  saveJsonToFile,
} from '../utils/ExportImportUtils';

const {
  getSocialIdentityProviders,
  exportSocialProvider,
  exportSocialProviders,
  importFirstSocialProvider,
  importSocialProvider,
  importSocialProviders,
} = frodo.oauth2oidc.external;

/**
 * Get a one-line description of the social idp object
 * @param {SocialIdpSkeleton} socialIdpObj social idp object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(socialIdpObj: SocialIdpSkeleton): string {
  const description = `[${socialIdpObj._id['brightCyan']}] ${socialIdpObj._type._id}`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Name/Id | Status | Type |\n';
  markdown += '| ------- | ------ | ---- |';
  return markdown;
}

/**
 * Get a table-row of the social idp in markdown
 * @param {SocialIdpSkeleton} socialIdpObj social idp object to describe
 * @returns {string} a table-row of the social idp in markdown
 */
export function getTableRowMd(socialIdpObj: SocialIdpSkeleton): string {
  const row = `| ${socialIdpObj._id} | ${
    socialIdpObj.enabled === false
      ? ':o: `disabled`'
      : ':white_check_mark: `enabled`'
  } | ${socialIdpObj._type.name} |`;
  return row;
}

/**
 * List providers
 */
export async function listSocialProviders() {
  try {
    const providers = await getSocialIdentityProviders();
    providers.sort((a, b) => a._id.localeCompare(b._id));
    providers.forEach((socialIdentityProvider) => {
      printMessage(`${socialIdentityProvider._id}`, 'data');
    });
  } catch (err) {
    printMessage(`listSocialProviders ERROR: ${err.message}`, 'error');
    printMessage(err, 'error');
  }
}

/**
 * Export provider by id
 * @param {string} providerId provider id/name
 * @param {string} file optional export file name
 */
export async function exportSocialProviderToFile(
  providerId: string,
  file = ''
) {
  debugMessage(`cli.IdpOps.exportSocialProviderToFile: start`);
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(providerId, 'idp');
  }
  createProgressBar(1, `Exporting ${providerId}`);
  try {
    updateProgressBar(`Writing file ${fileName}`);
    const fileData = await exportSocialProvider(providerId);
    saveJsonToFile(fileData, fileName);
    stopProgressBar(
      `Exported ${providerId['brightCyan']} to ${fileName['brightCyan']}.`
    );
  } catch (err) {
    stopProgressBar(`${err}`);
    printMessage(`${err}`, 'error');
  }
  debugMessage(`cli.IdpOps.exportSocialProviderToFile: end`);
}

/**
 * Export all providers
 * @param {string} file optional export file name
 */
export async function exportSocialProvidersToFile(file = '') {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(`all${getRealmString()}Providers`, 'idp');
  }
  const fileData = await exportSocialProviders();
  saveJsonToFile(fileData, fileName);
}

/**
 * Export all providers to individual files
 */
export async function exportSocialProvidersToFiles() {
  debugMessage(`cli.IdpOps.exportSocialProvidersToFiles: start`);
  try {
    const allIdpsData = await getSocialIdentityProviders();
    createProgressBar(allIdpsData.length, 'Exporting providers');
    for (const idpData of allIdpsData) {
      try {
        const fileName = getTypedFilename(idpData._id, 'idp');
        const fileData = await exportSocialProvider(idpData._id);
        saveJsonToFile(fileData, fileName);
        updateProgressBar(`Exported provider ${idpData._id}`);
      } catch (error) {
        printMessage(`Error exporting ${idpData._id}: ${error}`, 'error');
      }
    }
    stopProgressBar(`${allIdpsData.length} providers exported.`);
  } catch (error) {
    stopProgressBar(`${error}`);
    printMessage(`${error}`, 'error');
  }
  debugMessage(`cli.IdpOps.exportSocialProvidersToFiles: end`);
}

/**
 * Import provider by id/name
 * @param {string} providerId provider id/name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if provider was imported successfully, false otherwise
 */
export async function importSocialProviderFromFile(
  providerId: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Importing provider ${providerId} from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      outcome = await importSocialProvider(providerId, fileData);
      succeedSpinner(
        `Successfully imported provider ${providerId} from ${file}.`
      );
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
export async function importFirstSocialProviderFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Importing first provider from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      outcome = await importFirstSocialProvider(fileData);
      succeedSpinner(`Successfully imported first provider from ${file}.`);
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
export async function importSocialProvidersFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  showSpinner(`Importing providers from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      outcome = await importSocialProviders(fileData);
      succeedSpinner(`Successfully imported providers from ${file}.`);
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
export async function importSocialProvidersFromFiles() {
  const names = fs.readdirSync('.');
  const jsonFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.idp.json')
  );

  createProgressBar(jsonFiles.length, 'Importing providers...');
  let total = 0;
  for (const file of jsonFiles) {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    const count = Object.keys(fileData.idp).length;
    total += count;
    await importSocialProviders(fileData);
    updateProgressBar(`Imported ${count} provider(s) from ${file}`);
  }
  stopProgressBar(
    `Finished importing ${total} provider(s) from ${jsonFiles.length} file(s).`
  );
}
