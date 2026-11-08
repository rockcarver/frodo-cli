import fs from 'fs';
import path from 'path';
import {
  frodo,
  type Saml2EntitiesExportOptions,
  type Saml2EntitiesImportOptions,
  type Saml2ExportInterface,
  type Saml2ProviderSkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
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
import { causeOf } from '../utils/ErrorCause';
import { importItemsOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';

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
  const description = `[${c.heading(saml2ProviderObj.entityId)}]${
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
        c.heading('Entity Id'),
        c.heading('Location'),
        c.heading('Role(s)'),
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
      `Exported ${c.heading(entityId)} metadata to ${c.heading(filePath)}.`
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
      `Exported ${c.heading(entityId)} to ${c.heading(filePath)}.`
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
 * One operation: the library reports the items it could not export in one combined error and returns no export
 * data then, so no file is written and the command fails (`--allow-failures` does not apply to a file that does not
 * exist). The printed error names the items.
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
 * Export all providers to separate files
 * Every provider is exported on its own: a provider that cannot be exported or saved does not stop the others, one
 * summary names the ones that could not be, and a failure to read the providers ends the command whatever
 * `--allow-failures` says.
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {Saml2EntitiesExportOptions} options export options
 * @param {boolean} allowFailures true to report providers that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSaml2ProvidersToFiles(
  includeMeta: boolean = true,
  options: Saml2EntitiesExportOptions = { deps: true },
  allowFailures = false
): Promise<boolean> {
  let indicatorId: string;
  try {
    const stubs = await readSaml2ProviderStubs();
    if (stubs.length > 0) {
      indicatorId = createProgressIndicator(
        'determinate',
        stubs.length,
        'Exporting providers'
      );
      const run = new OperationRun({ unit: 'SAML provider', allowFailures });
      for (const stub of stubs) {
        await run.run(stub.entityId, async () => {
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
        });
      }
      stopProgressIndicator(
        indicatorId,
        run.hasFailures
          ? `Some providers could not be exported.`
          : `${stubs.length} providers exported.`,
        run.hasFailures ? 'fail' : 'success'
      );
      return run.finish();
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
 * Every provider in the file is tried: one that cannot be imported is printed and named in one summary,
 * and the others are still imported. A file that cannot be read or parsed ends the command
 * whatever `--allow-failures` says.
 * @param {String} file Import file name
 * @param {Saml2ProviderImportOptions} options import options
 * @param {boolean} allowFailures true to report providers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSaml2ProvidersFromFile(
  file: string,
  options: Saml2EntitiesImportOptions = { deps: true },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'SAML provider', allowFailures });
  let fileData: Saml2ExportInterface;
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    fileData = JSON.parse(data);
  } catch (error) {
    // not an item failure: the file that was named cannot be read
    printError(error);
    return false;
  }
  await importItemsOfFile(run, fileData, {
    count: countSaml2Providers,
    importItems: (data) => importSaml2Providers(data, options),
    fallbackName: file,
  });
  return run.finish();
}

/**
 * The number of providers in a SAML export file
 * @param {Saml2ExportInterface} fileData the parsed import file
 * @returns {number} the number of hosted and remote providers
 */
function countSaml2Providers(fileData: Saml2ExportInterface): number {
  return (
    Object.keys(fileData.saml.hosted).length +
    Object.keys(fileData.saml.remote).length
  );
}

/**
 * Import all SAML entity providers from all *.saml.json files in the current directory
 * Every file is tried: a file that cannot be read, or a provider in it that cannot be imported, is
 * printed and named in one summary, and the others are still imported. A directory that cannot be
 * read ends the command whatever `--allow-failures` says.
 * @param {Saml2ProviderImportOptions} options import options
 * @param {boolean} allowFailures true to report providers that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSaml2ProvidersFromFiles(
  options: Saml2EntitiesImportOptions = { deps: true },
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'SAML provider', allowFailures });
  let jsonFiles: string[];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    jsonFiles = names
      .filter((name) => name.toLowerCase().endsWith('.saml.json'))
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
    let fileData: Saml2ExportInterface;
    try {
      fileData = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      printError(error, `Error importing providers from ${file}`);
      run.recordFailure(path.basename(file), error);
      updateProgressIndicator(indicatorId, `Error reading ${file}.`);
      continue;
    }
    await importItemsOfFile(run, fileData, {
      count: countSaml2Providers,
      importItems: (data) => importSaml2Providers(data, options),
      fallbackName: path.basename(file),
    });
    updateProgressIndicator(indicatorId, `Imported providers from ${file}.`);
  }
  const outcome = run.finish();
  stopProgressIndicator(
    indicatorId,
    outcome
      ? `Finished importing providers from ${jsonFiles.length} file(s).`
      : `Error importing providers`,
    outcome ? 'success' : 'fail'
  );
  return outcome;
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

/**
 * Delete all entity providers. The CLI reads the providers and deletes them one
 * by one, so that a failed read (nothing was tried) is told from a failed delete
 * (the others still run) without looking at the library's error messages.
 * @param {boolean} allowFailures true to report providers that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSaml2Providers(
  allowFailures = false
): Promise<boolean> {
  debugMessage(`cli.Saml2Ops.deleteSaml2Providers: begin`);
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading entity providers...`
  );
  try {
    const stubs = await readSaml2ProviderStubs();
    stubs.sort((a, b) => a.entityId.localeCompare(b.entityId));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${stubs.length} entity providers.`,
      'success'
    );
    if (stubs.length === 0) {
      printMessage('No entity providers found to delete.');
      return true;
    }
    const indicatorId = createProgressIndicator(
      'determinate',
      stubs.length,
      `Deleting entity providers...`
    );
    const run = new OperationRun({ unit: 'entity provider', allowFailures });
    for (const stub of stubs) {
      try {
        await deleteSaml2Provider(stub.entityId);
        run.recordSuccess();
        updateProgressIndicator(indicatorId, `Deleted ${stub.entityId}`);
      } catch (error) {
        printError(error);
        run.recordFailure(stub.entityId, causeOf(error));
      }
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? `Some entity providers could not be deleted.`
        : `Deleted ${stubs.length} entity providers.`,
      run.hasFailures ? 'fail' : 'success'
    );
    debugMessage(`cli.Saml2Ops.deleteSaml2Providers: end`);
    return run.finish();
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error deleting entity providers`, 'fail');
    printError(error);
  }
  return false;
}
