import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { SocialIdpSkeleton } from '@rockcarver/frodo-lib/types/api/SocialIdentityProvidersApi';
import { type SocialIdentityProviderImportOptions } from '@rockcarver/frodo-lib/types/ops/IdpOps';
import fs from 'fs';

import {
  createProgressIndicator,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const { getRealmString, getTypedFilename, saveJsonToFile } = frodo.utils;
const {
  readSocialIdentityProviders,
  deleteSocialIdentityProvider,
  exportSocialIdentityProvider,
  exportSocialIdentityProviders,
  importFirstSocialIdentityProvider,
  importSocialIdentityProvider,
  importSocialIdentityProviders,
} = frodo.oauth2oidc.external;

const { getFilePath, getWorkingDirectory } = frodo.utils;

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
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function listSocialProviders(): Promise<boolean> {
  try {
    const providers = await readSocialIdentityProviders();
    providers.sort((a, b) => a._id.localeCompare(b._id));
    providers.forEach((socialIdentityProvider) => {
      printMessage(`${socialIdentityProvider._id}`, 'data');
    });
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export provider by id
 * @param {string} providerId provider id/name
 * @param {string} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function exportSocialIdentityProviderToFile(
  providerId: string,
  file: string = '',
  includeMeta: boolean = true
): Promise<boolean> {
  debugMessage(`cli.IdpOps.exportSocialIdentityProviderToFile: start`);
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(providerId, 'idp');
  }
  const filePath = getFilePath(fileName, true);
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${providerId}`
  );
  try {
    updateProgressIndicator(indicatorId, `Writing file ${filePath}`);
    const fileData = await exportSocialIdentityProvider(providerId);
    saveJsonToFile(fileData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported ${providerId['brightCyan']} to ${filePath['brightCyan']}.`
    );
    debugMessage(`cli.IdpOps.exportSocialIdentityProviderToFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error}`);
    printError(error);
  }
  return false;
}

/**
 * Export all providers
 * @param {string} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function exportSocialIdentityProvidersToFile(
  file: string = '',
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(`all${getRealmString()}Providers`, 'idp');
    }
    const fileData = await exportSocialIdentityProviders();
    saveJsonToFile(fileData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all providers to individual files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function exportSocialIdentityProvidersToFiles(
  includeMeta: boolean = true
): Promise<boolean> {
  debugMessage(`cli.IdpOps.exportSocialIdentityProvidersToFiles: start`);
  let indicatorId: string;
  const errors: Error[] = [];
  try {
    const allIdpsData = await readSocialIdentityProviders();
    indicatorId = createProgressIndicator(
      'determinate',
      allIdpsData.length,
      'Exporting providers'
    );
    for (const idpData of allIdpsData) {
      try {
        const fileName = getTypedFilename(idpData._id, 'idp');
        const fileData = await exportSocialIdentityProvider(idpData._id);
        saveJsonToFile(fileData, getFilePath(fileName, true), includeMeta);
        updateProgressIndicator(
          indicatorId,
          `Exported provider ${idpData._id}`
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting dependencies`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `${allIdpsData.length} providers exported.`
    );
    debugMessage(`cli.IdpOps.exportSocialIdentityProvidersToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting providers`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import provider by id/name
 * @param {string} providerId provider id/name
 * @param {string} file import file name
 * @param {SocialIdentityProviderImportOptions} options import options
 * @returns {Promise<boolean>} true if provider was imported successfully, false otherwise
 */
export async function importSocialIdentityProviderFromFile(
  providerId: string,
  file: string,
  options: SocialIdentityProviderImportOptions = { deps: true }
): Promise<boolean> {
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing provider ${providerId} from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importSocialIdentityProvider(providerId, fileData, options);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported provider ${providerId} from ${filePath}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing provider ${providerId} from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import first provider from file
 * @param {String} file import file name
 * @param {SocialIdentityProviderImportOptions} options import options
 * @returns {Promise<boolean>} true if first provider was imported successfully, false otherwise
 */
export async function importFirstSocialIdentityProviderFromFile(
  file: string,
  options: SocialIdentityProviderImportOptions = { deps: true }
): Promise<boolean> {
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing first provider from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstSocialIdentityProvider(fileData, options);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported first provider from ${filePath}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing first provider from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import all providers from file
 * @param {string} file import file name
 * @param {SocialIdentityProviderImportOptions} options import options
 * @returns {Promise<boolean>} true if all providers were imported successfully, false otherwise
 */
export async function importSocialIdentityProvidersFromFile(
  file: string,
  options: SocialIdentityProviderImportOptions = { deps: true }
): Promise<boolean> {
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing providers from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importSocialIdentityProviders(fileData, options);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported providers from ${filePath}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing providers from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import providers from *.idp.json files in current working directory
 * @param {SocialIdentityProviderImportOptions} options import options
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function importSocialIdentityProvidersFromFiles(
  options: SocialIdentityProviderImportOptions = { deps: true }
): Promise<boolean> {
  let indicatorId: string;
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const jsonFiles = names
      .filter((name) => name.toLowerCase().endsWith('.idp.json'))
      .map((name) => getFilePath(name));

    indicatorId = createProgressIndicator(
      'determinate',
      jsonFiles.length,
      'Importing providers...'
    );
    let total = 0;
    for (const file of jsonFiles) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData = JSON.parse(data);
        const count = Object.keys(fileData.idp).length;
        total += count;
        await importSocialIdentityProviders(fileData, options);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} provider(s) from ${file}`
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing providers`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} provider(s) from ${jsonFiles.length} file(s).`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing providers`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete idp by id
 * @param {String} id idp id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSocialIdentityProviderById(
  id: string
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${id}...`
  );
  try {
    await deleteSocialIdentityProvider(id);
    stopProgressIndicator(spinnerId, `Deleted ${id}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}
