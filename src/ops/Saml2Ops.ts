import { frodo } from '@rockcarver/frodo-lib';
import { type Saml2ProviderSkeleton } from '@rockcarver/frodo-lib/types/api/Saml2Api';
import { type Saml2ExportInterface } from '@rockcarver/frodo-lib/types/ops/Saml2Ops';
import fs from 'fs';

import {
  createObjectTable,
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
import { saveTextToFile } from '../utils/ExportImportUtils';

const { decodeBase64, getFilePath, getWorkingDirectory } = frodo.utils;
const { getTypedFilename, saveJsonToFile, getRealmString, validateImport } =
  frodo.utils;
const {
  readSaml2ProviderStubs,
  readSaml2Provider,
  readSaml2ProviderStub,
  getSaml2ProviderMetadataUrl,
  getSaml2ProviderMetadata,
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
 */
export async function listSaml2Providers(long = false) {
  const providerList = await readSaml2ProviderStubs();
  providerList.sort((a, b) => a._id.localeCompare(b._id));
  if (!long) {
    for (const provider of providerList) {
      printMessage(`${provider.entityId}`, 'data');
    }
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
  }
}

/**
 * Describe an entity provider's configuration
 * @param {String} entityId Provider entity id
 */
export async function describeSaml2Provider(entityId) {
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
  } catch (error) {
    printMessage(error.message, 'error');
  }
}

/**
 * Export provider metadata to file
 * @param {String} entityId Provider entity id
 * @param {String} file Optional filename
 */
export async function exportSaml2MetadataToFile(entityId, file = null) {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(entityId, 'metadata', 'xml');
  }
  const filePath = getFilePath(fileName, true);
  createProgressBar(1, `Exporting metadata for: ${entityId}`);
  try {
    updateProgressBar(`Writing file ${filePath}`);
    const metaData = await getSaml2ProviderMetadata(entityId);
    saveTextToFile(metaData, filePath);
    updateProgressBar(`Exported provider ${entityId}`);
    stopProgressBar(
      // @ts-expect-error - brightCyan colors the string, even though it is not a property of string
      `Exported ${entityId.brightCyan} metadata to ${filePath.brightCyan}.`
    );
  } catch (error) {
    stopProgressBar(`${error}`);
    printMessage(error, 'error');
  }
}

/**
 * Export a single entity provider to file
 * @param {String} entityId Provider entity id
 * @param {String} file Optional filename
 */
export async function exportSaml2ProviderToFile(entityId, file = null) {
  debugMessage(
    `cli.Saml2Ops.exportSaml2ProviderToFile: start [entityId=${entityId}, file=${file}]`
  );
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(entityId, 'saml');
  }
  const filePath = getFilePath(fileName, true);
  try {
    createProgressBar(1, `Exporting provider ${entityId}`);
    const fileData = await exportSaml2Provider(entityId);
    saveJsonToFile(fileData, filePath);
    updateProgressBar(`Exported provider ${entityId}`);
    stopProgressBar(
      // @ts-expect-error - brightCyan colors the string, even though it is not a property of string
      `Exported ${entityId.brightCyan} to ${filePath.brightCyan}.`
    );
  } catch (err) {
    stopProgressBar(`${err}`);
    printMessage(err, 'error');
  }
  debugMessage(
    `cli.Saml2Ops.exportSaml2ProviderToFile: end [entityId=${entityId}, file=${filePath}]`
  );
}

/**
 * Export all entity providers to one file
 * @param {String} file Optional filename
 */
export async function exportSaml2ProvidersToFile(file = null) {
  debugMessage(`cli.Saml2Ops.exportSaml2ProviderToFile: start [file=${file}]`);
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(`all${getRealmString()}Providers`, 'saml');
  }
  try {
    const exportData = await exportSaml2Providers();
    saveJsonToFile(exportData, getFilePath(fileName, true));
  } catch (error) {
    printMessage(error.message, 'error');
    printMessage(
      `exportSaml2ProvidersToFile: ${error.response?.status}`,
      'error'
    );
  }
  debugMessage(`cli.Saml2Ops.exportSaml2ProviderToFile: end [file=${file}]`);
}

/**
 * Export all entity providers to individual files
 */
export async function exportSaml2ProvidersToFiles() {
  const stubs = await readSaml2ProviderStubs();
  if (stubs.length > 0) {
    createProgressBar(stubs.length, 'Exporting providers');
    for (const stub of stubs) {
      const fileName = getTypedFilename(stub.entityId, 'saml');
      const fileData = await exportSaml2Provider(stub.entityId);
      saveJsonToFile(fileData, getFilePath(fileName, true));
      updateProgressBar(`Exported provider ${stub.entityId}`);
    }
    stopProgressBar(`${stubs.length} providers exported.`);
  } else {
    printMessage('No entity providers found.', 'info');
  }
}

/**
 * Import a SAML entity provider by entity id from file
 * @param {String} entityId Provider entity id
 * @param {String} file Import file name
 */
export async function importSaml2ProviderFromFile(
  entityId: string,
  file: string
) {
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const fileData = JSON.parse(data);
    showSpinner(`Importing ${entityId}...`);
    try {
      await importSaml2Provider(entityId, fileData);
      succeedSpinner(`Imported ${entityId}.`);
    } catch (error) {
      failSpinner(`Error importing ${entityId}: ${error.message}`);
    }
  });
}

/**
 * Import a SAML entity provider by entity id from file
 * @param {String} file Import file name
 */
export async function importFirstSaml2ProviderFromFile(file: string) {
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const fileData = JSON.parse(data) as Saml2ExportInterface;
    // pick the first provider and run with it
    const entityId64 =
      Object.keys(fileData.saml.remote)[0] ||
      Object.keys(fileData.saml.hosted)[0];
    const entityId = decodeBase64(entityId64);
    showSpinner(`Importing ${entityId}...`);
    try {
      await importSaml2Provider(entityId, fileData);
      succeedSpinner(`Imported ${entityId}.`);
    } catch (error) {
      failSpinner(`Error importing ${entityId}: ${error.message}`);
    }
  });
}

/**
 * Import all SAML entity providers from file
 * @param {String} file Import file name
 */
export async function importSaml2ProvidersFromFile(file: string) {
  fs.readFile(getFilePath(file), 'utf8', async (err, data) => {
    if (err) throw err;
    const fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      await importSaml2Providers(fileData);
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Import all SAML entity providers from all *.saml.json files in the current directory
 */
export async function importSaml2ProvidersFromFiles() {
  const names = fs.readdirSync(getWorkingDirectory());
  const jsonFiles = names
    .filter((name) => name.toLowerCase().endsWith('.saml.json'))
    .map((name) => getFilePath(name));
  createProgressBar(jsonFiles.length, 'Importing providers...');
  let total = 0;
  for (const file of jsonFiles) {
    try {
      const data = fs.readFileSync(file, 'utf8');
      const fileData = JSON.parse(data);
      if (validateImport(fileData.meta)) {
        const result = await importSaml2Providers(fileData);
        total += result.length;
        updateProgressBar(
          `Imported ${result.length} provider(s) from ${file}.`
        );
      } else {
        printMessage(`Validation of ${file} failed!`, 'error');
      }
    } catch (error) {
      printMessage(
        `Error importing providers from ${file}: ${error.message}`,
        'error'
      );
    }
  }
  stopProgressBar(
    `Imported ${total} provider(s) from ${jsonFiles.length} file(s).`
  );
}
