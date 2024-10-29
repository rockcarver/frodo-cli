import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { type Saml2ProviderSkeleton } from '@rockcarver/frodo-lib/types/api/Saml2Api';
import type {
  Saml2EntitiesExportOptions,
  Saml2EntitiesImportOptions,
  Saml2ExportInterface,
} from '@rockcarver/frodo-lib/types/ops/Saml2Ops';
import fs from 'fs';

import {
  createObjectTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const { decodeBase64, saveTextToFile, getFilePath, getWorkingDirectory } =
  frodo.utils;
const { getTypedFilename, saveJsonToFile, getRealmString } = frodo.utils;
const {
  readSaml2ProviderStubs,
  readSaml2Provider,
  readSaml2ProviderStub,
  getSaml2ProviderMetadataUrl,
  getSaml2ProviderMetadata,
  deleteSaml2Provider,
  exportSaml2Provider,
  exportSaml2Providers,
  importSaml2Provider,
  importSaml2Providers,
} = frodo.saml2.entityProvider;

const roleMap = {
  identityProvider: 'IDP',
  serviceProvider: 'SP',
  attributeQueryProvider: 'AttrQuery',
  xacmlPolicyEnforcementPoint: 'XACML PEP',
};

/**
 * Get a one-line description of the saml2 provider object
 * @param {Saml2ProviderSkeleton} saml2ProviderObj saml2 provider object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(
  saml2ProviderObj: Saml2ProviderSkeleton
): string {
  const roles: string[] = [];
  for (const [key, value] of Object.entries(roleMap)) {
    if (saml2ProviderObj[key]) {
      roles.push(value);
    }
  }
  const description = `[${saml2ProviderObj.entityId['brightCyan']}]${
    ' (' + saml2ProviderObj.entityLocation
  }${roles.length ? ' ' + roles.join(', ') + ')' : ')'}`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Entity Id | Location | Role(s) |\n';
  markdown += '| --------- | -------- | ------- |';
  return markdown;
}

/**
 * Get a table-row of the saml2 provider in markdown
 * @param {Saml2ProviderSkeleton} saml2ProviderObj saml2 provider object to describe
 * @returns {string} a table-row of the saml2 provider in markdown
 */
export function getTableRowMd(saml2ProviderObj: Saml2ProviderSkeleton): string {
  const roles: string[] = [];
  for (const [key, value] of Object.entries(roleMap)) {
    if (saml2ProviderObj[key]) {
      roles.push(value);
    }
  }
  const row = `| ${saml2ProviderObj.entityId} | ${
    saml2ProviderObj.entityLocation
  } | ${roles.length ? roles.join(', ') : ''} |`;
  return row;
}

/**
 * List entity providers
 * @param {boolean} long Long list format with details
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listSaml2Providers(
  long: boolean = false
): Promise<boolean> {
  try {
    const providerList = await readSaml2ProviderStubs();
    providerList.sort((a, b) => a._id.localeCompare(b._id));
    if (!long) {
      for (const provider of providerList) {
        printMessage(`${provider.entityId}`, 'data');
      }
      return true;
    } else {
      const table = createTable([
        'Entity Id'['brightCyan'],
        'Location'['brightCyan'],
        'Role(s)'['brightCyan'],
      ]);
      for (const provider of providerList) {
        table.push([
          provider.entityId,
          provider.location,
          provider.roles.map((role) => roleMap[role]).join(', '),
        ]);
      }
      printMessage(table.toString(), 'data');
      return true;
    }
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Describe an entity provider's configuration
 * @param {String} entityId Provider entity id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeSaml2Provider(
  entityId: string
): Promise<boolean> {
  try {
    const stub = await readSaml2ProviderStub(entityId);
    const { location } = stub;
    const roles = stub.roles.map((role: string) => roleMap[role]).join(', ');
    const rawProviderData = await readSaml2Provider(entityId);
    delete rawProviderData._id;
    delete rawProviderData._rev;
    rawProviderData.location = location;
    rawProviderData.roles = roles;
    rawProviderData.metadataUrl = getSaml2ProviderMetadataUrl(entityId);
    const table = createObjectTable(rawProviderData);
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export provider metadata to file
 * @param {String} entityId Provider entity id
 * @param {String} file Optional filename
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSaml2MetadataToFile(
  entityId: string,
  file: string = null
): Promise<boolean> {
  let indicatorId: string;
  try {
    if (!file) {
      file = getTypedFilename(entityId, 'metadata', 'xml');
    }
    const filePath = getFilePath(file, true);
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting metadata for: ${entityId}`
    );
    updateProgressIndicator(indicatorId, `Writing file ${filePath}`);
    const metaData = await getSaml2ProviderMetadata(entityId);
    saveTextToFile(metaData, filePath);
    updateProgressIndicator(indicatorId, `Exported provider ${entityId}`);
    stopProgressIndicator(
      indicatorId,
      `Exported ${entityId['brightCyan']} metadata to ${filePath['brightCyan']}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting saml2 metadata`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export a single entity provider to file
 * @param {String} entityId Provider entity id
 * @param {String} file Optional filename
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSaml2ProviderToFile(
  entityId: string,
  file: string = null,
  includeMeta: boolean = true,
  options: Saml2EntitiesExportOptions = { deps: true }
): Promise<boolean> {
  debugMessage(
    `cli.Saml2Ops.exportSaml2ProviderToFile: start [entityId=${entityId}, file=${file}]`
  );
  let indicatorId: string;
  try {
    if (!file) {
      file = getTypedFilename(entityId, 'saml');
    }
    const filePath = getFilePath(file, true);
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting provider ${entityId}`
    );
    const fileData = await exportSaml2Provider(entityId, options);
    saveJsonToFile(fileData, filePath, includeMeta);
    updateProgressIndicator(indicatorId, `Exported provider ${entityId}`);
    stopProgressIndicator(
      indicatorId,
      // @ts-expect-error - brightCyan colors the string, even though it is not a property of string
      `Exported ${entityId.brightCyan} to ${filePath.brightCyan}.`
    );
    debugMessage(
      `cli.Saml2Ops.exportSaml2ProviderToFile: end [entityId=${entityId}, file=${filePath}]`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting saml2 provider`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all entity providers to one file
 * @param {String} file Optional filename
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSaml2ProvidersToFile(
  file: string = null,
  includeMeta: boolean = true,
  options: Saml2EntitiesExportOptions = { deps: true }
): Promise<boolean> {
  debugMessage(`cli.Saml2Ops.exportSaml2ProviderToFile: start [file=${file}]`);
  try {
    if (!file) {
      file = getTypedFilename(`all${getRealmString()}Providers`, 'saml');
    }
    const exportData = await exportSaml2Providers(options);
    saveJsonToFile(exportData, getFilePath(file, true), includeMeta);
    debugMessage(`cli.Saml2Ops.exportSaml2ProviderToFile: end [file=${file}]`);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all entity providers to individual files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSaml2ProvidersToFiles(
  includeMeta: boolean = true,
  options: Saml2EntitiesExportOptions = { deps: true }
): Promise<boolean> {
  const errors: Error[] = [];
  let indicatorId: string;
  try {
    const stubs = await readSaml2ProviderStubs();
    if (stubs.length > 0) {
      indicatorId = createProgressIndicator(
        'determinate',
        stubs.length,
        'Exporting providers'
      );
      for (const stub of stubs) {
        try {
          const file = getFilePath(
            getTypedFilename(stub.entityId, 'saml'),
            true
          );
          const fileData = await exportSaml2Provider(stub.entityId, options);
          saveJsonToFile(fileData, file, includeMeta);
          updateProgressIndicator(
            indicatorId,
            `Exported provider ${stub.entityId}`
          );
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new FrodoError(`Error exporting providers`, errors);
      }
      stopProgressIndicator(indicatorId, `${stubs.length} providers exported.`);
      return true;
    } else {
      printMessage('No entity providers found.', 'info');
      return true;
    }
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting providers`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import a SAML entity provider by entity id from file
 * @param {String} entityId Provider entity id
 * @param {String} file Import file name
 * @param {Saml2ProviderImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSaml2ProviderFromFile(
  entityId: string,
  file: string,
  options: Saml2EntitiesImportOptions = { deps: true }
): Promise<boolean> {
  let indicatorId: string;
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${entityId}...`
    );
    await importSaml2Provider(entityId, fileData, options);
    stopProgressIndicator(indicatorId, `Imported ${entityId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing provider ${entityId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import a SAML entity provider by entity id from file
 * @param {String} file Import file name
 * @param {Saml2ProviderImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstSaml2ProviderFromFile(
  file: string,
  options: Saml2EntitiesImportOptions = { deps: true }
): Promise<boolean> {
  let indicatorId: string;
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data) as Saml2ExportInterface;
    // pick the first provider and run with it
    const entityId64 =
      Object.keys(fileData.saml.remote)[0] ||
      Object.keys(fileData.saml.hosted)[0];
    const entityId = decodeBase64(entityId64);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing ${entityId}...`
    );
    await importSaml2Provider(entityId, fileData, options);
    stopProgressIndicator(indicatorId, `Imported ${entityId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing provider`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import all SAML entity providers from file
 * @param {String} file Import file name
 * @param {Saml2ProviderImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSaml2ProvidersFromFile(
  file: string,
  options: Saml2EntitiesImportOptions = { deps: true }
): Promise<boolean> {
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await importSaml2Providers(fileData, options);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import all SAML entity providers from all *.saml.json files in the current directory
 * @param {Saml2ProviderImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSaml2ProvidersFromFiles(
  options: Saml2EntitiesImportOptions = { deps: true }
): Promise<boolean> {
  const errors: Error[] = [];
  let indicatorId: string;
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const jsonFiles = names
      .filter((name) => name.toLowerCase().endsWith('.saml.json'))
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
        const result = await importSaml2Providers(fileData, options);
        total += result.length;
        updateProgressIndicator(
          indicatorId,
          `Imported ${result.length} provider(s) from ${file}.`
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
      `Imported ${total} provider(s) from ${jsonFiles.length} file(s).`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing providers`);
    printError(error);
  }
  return false;
}

/**
 * Delete saml by id
 * @param {String} id saml entityId
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSaml2ProviderById(
  entityId: string
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${entityId}...`
  );
  try {
    await deleteSaml2Provider(entityId);
    stopProgressIndicator(spinnerId, `Deleted ${entityId}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}
