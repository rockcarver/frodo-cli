import fs from 'fs';
import path from 'path';
import { Saml2ProviderSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { Saml2, ExportImportUtils, Base64 } from '@rockcarver/frodo-lib';
import {
  MultiOpStatusInterface,
  Saml2ExportInterface,
} from '@rockcarver/frodo-lib/types/ops/OpsTypes';
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

const {
  roleMap,
  exportSaml2Provider,
  exportSaml2Providers,
  getSaml2ProviderStubs,
  getProviderByLocationAndId,
  getProviderMetadata,
  getProviderMetadataUrl,
  getSaml2ProviderStub,
  getRawSaml2Providers,
  getRawSaml2Provider,
  importSaml2Provider,
  importSaml2Providers,
  putRawSaml2Provider,
} = Saml2;
const {
  getTypedFilename,
  saveJsonToFile,
  getRealmString,
  saveToFile,
  validateImport,
} = ExportImportUtils;

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
    printMessage(stub);
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
    const entityId = Base64.decode(entityId64);
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

/**
 * List entity providers
 */
export async function listRawSaml2Providers() {
  const providerList = (await getRawSaml2Providers()).result;
  providerList.sort((a, b) => a._id.localeCompare(b._id));
  for (const provider of providerList) {
    printMessage(`${provider._id}`, 'data');
  }
}

/**
 * Exports a RAW SAML entity, which means the raw xml is included.
 * @param {string} entityId Reference to the entity for export
 * @param {string} file Optional filename for the exported file
 */
export async function exportRawSaml2ProviderToFile(entityId, file = null) {
  printMessage(`Exporting raw SAML entity provider ${entityId}`, 'info');
  let fileName = file;
  if (!file) {
    fileName = getTypedFilename(`${entityId}`, 'raw.saml');
  }
  createProgressBar(1, `Exporting raw entity provider: ${entityId}`);
  try {
    const rawData = await getRawSaml2Provider(entityId);
    updateProgressBar(`Writing file ${fileName}`);
    saveTextToFile(JSON.stringify(rawData, null, 2), fileName);
    stopProgressBar(`Exported raw entity provider ${entityId} to ${fileName}.`);
  } catch (error) {
    stopProgressBar(`Error exporting raw entity ${entityId}: ${error.message}`);
    printMessage(error.response?.data, 'error');
  }
}

/**
 * Export all entity providers raw to one file
 * @param {String} file Optional filename
 */
export async function exportRawSaml2ProvidersToFile(file = null) {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(
      `all${getRealmString()}ProvidersRaw`,
      'raw.saml'
    );
  }
  try {
    const samlApplicationList = (await getRawSaml2Providers()).result;

    saveToFile('application', samlApplicationList, '_id', fileName);
    printMessage(
      `All RAW saml entity providers exported to: ${fileName}`,
      'info'
    );
  } catch (error) {
    printMessage(error.message, 'error');
    printMessage(
      `exportRawSaml2ProvidersToFile: ${error.response?.status}`,
      'error'
    );
  }
}

/**
 * Export all entity providers to individual files
 */
export async function exportRawSaml2ProvidersToFiles() {
  const samlApplicationList = (await getRawSaml2Providers()).result;
  let hasError = false;
  createProgressBar(samlApplicationList.length, 'Exporting RAW providers');
  let exportedAmount = 0;
  for (const item of samlApplicationList) {
    updateProgressBar(`Exporting provider ${item.entityId}`);
    try {
      const samlApplicationData = await getRawSaml2Provider(item._id);
      const fileName = getTypedFilename(
        `${item._id}${getRealmString()}ProviderRaw`,
        'raw.saml'
      );
      saveToFile('application', [samlApplicationData], '_id', fileName);
      exportedAmount++;
    } catch (error) {
      hasError = true;
      printMessage(`Unable to export: ${item._id}`, 'error');
    }
  }
  stopProgressBar(`${exportedAmount} providers exported.`);
  if (!hasError) {
    printMessage('All entities exported.', 'info');
  } else {
    printMessage('All other entities exported.', 'info');
  }
}

/**
 * Imports a raw SAML export file (containing one entity).
 * @param {string} file The import file
 */
export async function importRawSaml2ProviderFromFile(
  // entityId: string,
  file: string
) {
  printMessage(`Importing SAML Entity ${file}...`, 'info');
  if (file.indexOf('.raw.saml.json') > -1) {
    const samlEntityData = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (validateImport(samlEntityData.meta)) {
      for (const id in samlEntityData.application) {
        // remove the "_rev" data before PUT
        delete samlEntityData.application[id]._rev;
        try {
          await putRawSaml2Provider(id, samlEntityData.application[id]);
        } catch (error) {
          printMessage(`Unable to import: ${id}`, 'error');
        }
        printMessage(`Imported ${id}`, 'info');
      }
    } else {
      printMessage('Import validation failed...', 'error');
    }
  }
}

/**
 * Import first raw SAML entity provider from file
 * @param {String} file Import file name
 */
export async function importFirstRawSaml2ProviderFromFile(file) {
  printMessage(`Importing SAML Entity ${file}...`, 'info');
  if (file.indexOf('.raw.saml.json') > -1) {
    const samlEntityData = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (validateImport(samlEntityData.meta)) {
      for (const id in samlEntityData.application) {
        // remove the "_rev" data before PUT
        delete samlEntityData.application[id]._rev;
        try {
          await putRawSaml2Provider(id, samlEntityData.application[id]);
        } catch (error) {
          printMessage(`Unable to import: ${id}`, 'error');
        }
        printMessage(`Imported ${id}`, 'info');
        return;
      }
    } else {
      printMessage('Import validation failed...', 'error');
    }
  }
}

/**
 * Imports the RAW provider info from a single file.
 * @param file Import file name
 */
export async function importRawSaml2ProvidersFromFile(file: string) {
  fs.readFile(file, 'utf8', async function (err, data) {
    if (err) throw err;
    const samlEntityData = JSON.parse(data);
    let amountOfEntities = 0;
    for (const id in samlEntityData.application) {
      if (id.length) {
        amountOfEntities++;
      }
    }
    if (validateImport(samlEntityData.meta)) {
      createProgressBar(amountOfEntities, 'Importing providers...');
      for (const id in samlEntityData.application) {
        // remove the "_rev" data before PUT
        delete samlEntityData.application[id]._rev;
        await putRawSaml2Provider(id, samlEntityData.application[id]).then(
          (result) => {
            if (result === null) {
              printMessage(`Import validation failed for ${id}`, 'error');
            }
          }
        );
        updateProgressBar(`Imported ${id}...`);
      }
      stopProgressBar(`Import done`);
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Whenever the SAML RAW file were exported using the exportRAW functionality this function
 * is used to read them back in. Only files with the .samlRaw.json extension will be imported.
 * @param {string} directory The directory from which to import the files
 */
export async function importRawSaml2ProvidersFromFiles(directory) {
  const files = fs.readdirSync(directory);
  const filesToImport = files.filter(
    (file) => file.indexOf('.samlRaw.json') > -1
  );

  if (filesToImport.length > 0) {
    createProgressBar(filesToImport.length, 'Importing providers...');
    filesToImport.forEach(async (file) => {
      const filePathAbsolute = path.join(directory, file);
      filesToImport.push(file);
      const samlEntityData = JSON.parse(
        fs.readFileSync(filePathAbsolute, 'utf8')
      );
      if (validateImport(samlEntityData.meta)) {
        for (const id in samlEntityData.application) {
          // remove the "_rev" data before PUT
          delete samlEntityData.application[id]._rev;
          await putRawSaml2Provider(id, samlEntityData.application[id]).then(
            (result) => {
              if (result === null) {
                printMessage(`Import validation failed for ${id}`, 'error');
              }
            }
          );
          updateProgressBar(`Imported ${id}...`);
        }
      } else {
        printMessage('Import validation failed...', 'error');
      }
    });
    stopProgressBar(`Import done`);
  } else {
    printMessage(
      'Import failed, no files to import. (check extension to be .samlRaw.json)',
      'warn'
    );
  }
}
