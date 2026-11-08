import fs from 'fs';
import path from 'path';
import {
  frodo,
  type SocialIdentityProviderImportOptions,
  type SocialIdpSkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
import {
  createProgressIndicator,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { importItemsOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';

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

/** The content of an import file of providers. */
type IdpImportData = Parameters<typeof importSocialIdentityProviders>[0];

/**
 * Get a one-line description of the social idp object
 * @param {SocialIdpSkeleton} socialIdpObj social idp object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(socialIdpObj: SocialIdpSkeleton): string {
  const description = `[${c.heading(socialIdpObj._id)}] ${socialIdpObj._type._id}`;
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
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${providerId}`
  );
  try {
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(providerId, 'idp');
    }
    const filePath = getFilePath(fileName, true);
    updateProgressIndicator(indicatorId, `Writing file ${filePath}`);
    const fileData = await exportSocialIdentityProvider(providerId);
    saveJsonToFile(fileData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported ${c.heading(providerId)} to ${c.heading(filePath)}.`
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
 * One operation: the library reports the items it could not export in one combined error and returns no export
 * data then, so no file is written and the command fails (`--allow-failures` does not apply to a file that does not
 * exist). The printed error names the items.
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
 * Export all providers to separate files
 * Every provider is exported on its own: a provider that cannot be exported or saved does not stop the others, one
 * summary names the ones that could not be, and a failure to read the providers ends the command whatever
 * `--allow-failures` says.
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} allowFailures true to report providers that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSocialIdentityProvidersToFiles(
  includeMeta: boolean = true,
  allowFailures = false
): Promise<boolean> {
  debugMessage(`cli.IdpOps.exportSocialIdentityProvidersToFiles: start`);
  let indicatorId: string;
  try {
    const allIdpsData = await readSocialIdentityProviders();
    indicatorId = createProgressIndicator(
      'determinate',
      allIdpsData.length,
      'Exporting providers'
    );
    const run = new OperationRun({ unit: 'identity provider', allowFailures });
    for (const idpData of allIdpsData) {
      await run.run(idpData._id, async () => {
        const fileName = getTypedFilename(idpData._id, 'idp');
        const fileData = await exportSocialIdentityProvider(idpData._id);
        saveJsonToFile(fileData, getFilePath(fileName, true), includeMeta);
        updateProgressIndicator(
          indicatorId,
          `Exported provider ${idpData._id}`
        );
      });
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? `Some providers could not be exported.`
        : `${allIdpsData.length} providers exported.`,
      run.hasFailures ? 'fail' : 'success'
    );
    debugMessage(`cli.IdpOps.exportSocialIdentityProvidersToFiles: end`);
    return run.finish();
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
 * Every provider in the file is tried: one that cannot be imported is printed and named in one summary,
 * and the others are still imported. A file that cannot be read or parsed ends the command
 * whatever `--allow-failures` says.
 * @param {string} file import file name
 * @param {SocialIdentityProviderImportOptions} options import options
 * @param {boolean} allowFailures true to report providers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if all providers were imported successfully, false otherwise
 */
export async function importSocialIdentityProvidersFromFile(
  file: string,
  options: SocialIdentityProviderImportOptions = { deps: true },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'identity provider', allowFailures });
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing providers from ${filePath}...`
  );
  let fileData: IdpImportData;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    fileData = JSON.parse(data);
  } catch (error) {
    // not an item failure: the file that was named cannot be read
    stopProgressIndicator(
      indicatorId,
      `Error importing providers from ${filePath}.`,
      'fail'
    );
    printError(error);
    return false;
  }
  await importItemsOfFile(run, fileData, {
    count: (data) => Object.keys(data.idp).length,
    importItems: (data) => importSocialIdentityProviders(data, options),
    fallbackName: file,
  });
  const outcome = run.finish();
  stopProgressIndicator(
    indicatorId,
    outcome
      ? `Successfully imported providers from ${filePath}.`
      : `Error importing providers from ${filePath}.`,
    outcome ? 'success' : 'fail'
  );
  return outcome;
}

/**
 * Import providers from *.idp.json files in current working directory
 * Every file is tried: a file that cannot be read, or a provider in it that cannot be imported, is
 * printed and named in one summary, and the others are still imported. A directory that cannot be
 * read ends the command whatever `--allow-failures` says.
 * @param {SocialIdentityProviderImportOptions} options import options
 * @param {boolean} allowFailures true to report providers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function importSocialIdentityProvidersFromFiles(
  options: SocialIdentityProviderImportOptions = { deps: true },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'identity provider', allowFailures });
  let jsonFiles: string[];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    jsonFiles = names
      .filter((name) => name.toLowerCase().endsWith('.idp.json'))
      .map((name) => getFilePath(name));
  } catch (error) {
    printError(error);
    return false;
  }
  const indicatorId = createProgressIndicator(
    'determinate',
    jsonFiles.length,
    'Importing providers...'
  );
  for (const file of jsonFiles) {
    let fileData: IdpImportData;
    try {
      fileData = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      printError(error);
      run.recordFailure(path.basename(file), error);
      updateProgressIndicator(
        indicatorId,
        `Error importing provider(s) from ${file}`
      );
      continue;
    }
    await importItemsOfFile(run, fileData, {
      count: (data) => Object.keys(data.idp).length,
      importItems: (data) => importSocialIdentityProviders(data, options),
      fallbackName: path.basename(file),
    });
    updateProgressIndicator(indicatorId, `Imported provider(s) from ${file}`);
  }
  const outcome = run.finish();
  stopProgressIndicator(
    indicatorId,
    outcome
      ? `Finished importing provider(s) from ${jsonFiles.length} file(s).`
      : `Error importing providers`,
    outcome ? 'success' : 'fail'
  );
  return outcome;
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
