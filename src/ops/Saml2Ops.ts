import { frodo } from '@rockcarver/frodo-lib';
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
import type {
  MultiOpStatusInterface,
  Saml2ExportInterface,
} from '@rockcarver/frodo-lib/types/ops/OpsTypes';
import type { Saml2ProviderSkeleton } from '@rockcarver/frodo-lib/types/api/Saml2Api';

const { decodeBase64 } = frodo.utils;
const { getTypedFilename, saveJsonToFile, getRealmString, validateImport } =
  frodo.utils;
const {
  getSaml2ProviderStubs,
  getProviderByLocationAndId,
  getSaml2ProviderStub,
  getProviderMetadataUrl,
  getProviderMetadata,
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
  const providerList = await getSaml2ProviderStubs();
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
    printMessage(table.toString());
  }
}

/**
 * Describe an entity provider's configuration
 * @param {String} entityId Provider entity id
 */
export async function describeSaml2Provider(entityId) {
  try {
    const stub = await getSaml2ProviderStub(entityId);
    const { location } = stub;
    const id = stub._id;
    const roles = stub.roles.map((role: string) => roleMap[role]).join(', ');
    const rawProviderData = await getProviderByLocationAndId(location, id);
    delete rawProviderData._id;
    delete rawProviderData._rev;
    rawProviderData.location = location;
    rawProviderData.roles = roles;
    rawProviderData.metadataUrl = getProviderMetadataUrl(entityId);
    const table = createObjectTable(rawProviderData);
    printMessage(table.toString());
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
  createProgressBar(1, `Exporting metadata for: ${entityId}`);
  try {
    updateProgressBar(`Writing file ${fileName}`);
    const metaData = await getProviderMetadata(entityId);
    saveTextToFile(metaData, fileName);
    updateProgressBar(`Exported provider ${entityId}`);
    stopProgressBar(
      `Exported ${entityId.brightCyan} metadata to ${fileName.brightCyan}.`
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
  try {
    createProgressBar(1, `Exporting provider ${entityId}`);
    const fileData = await exportSaml2Provider(entityId);
    saveJsonToFile(fileData, fileName);
    updateProgressBar(`Exported provider ${entityId}`);
    stopProgressBar(
      `Exported ${entityId.brightCyan} to ${fileName.brightCyan}.`
    );
  } catch (err) {
    stopProgressBar(`${err}`);
    printMessage(err, 'error');
  }
  debugMessage(
    `cli.Saml2Ops.exportSaml2ProviderToFile: end [entityId=${entityId}, file=${fileName}]`
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
    saveJsonToFile(exportData, fileName);
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
  const stubs = await getSaml2ProviderStubs();
  if (stubs.length > 0) {
    createProgressBar(stubs.length, 'Exporting providers');
    for (const stub of stubs) {
      const fileName = getTypedFilename(stub.entityId, 'saml');
      const fileData = await exportSaml2Provider(stub.entityId);
      saveJsonToFile(fileData, fileName);
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
  fs.readFile(file, 'utf8', async (err, data) => {
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
  fs.readFile(file, 'utf8', async (err, data) => {
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
  fs.readFile(file, 'utf8', async (err, data) => {
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
  const names = fs.readdirSync('.');
  const jsonFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.saml.json')
  );
  createProgressBar(jsonFiles.length, 'Importing providers...');
  const totalStatus: MultiOpStatusInterface = {
    total: 0,
    successes: 0,
    warnings: 0,
    failures: 0,
  };
  for (const file of jsonFiles) {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      const myStatus = await importSaml2Providers(fileData);
      totalStatus.total += myStatus.total;
      totalStatus.successes += myStatus.successes;
      totalStatus.warnings += myStatus.warnings;
      totalStatus.failures += myStatus.failures;
      updateProgressBar(
        `Imported ${myStatus.successes}/${myStatus.total} provider(s) from ${file}.`
      );
    } else {
      printMessage(`Validation of ${file} failed!`, 'error');
    }
  }
  stopProgressBar(
    `Imported ${totalStatus.successes} of ${totalStatus.total} provider(s) from ${jsonFiles.length} file(s).`
  );
}
