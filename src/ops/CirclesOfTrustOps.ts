import { frodo, state } from '@rockcarver/frodo-lib';
import { type CircleOfTrustSkeleton } from '@rockcarver/frodo-lib/types/api/CirclesOfTrustApi';
import { type CirclesOfTrustExportInterface } from '@rockcarver/frodo-lib/types/ops/CirclesOfTrustOps';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';

const { getRealmName, getFilePath, getWorkingDirectory } = frodo.utils;
const {
  readCirclesOfTrust,
  exportCircleOfTrust,
  exportCirclesOfTrust,
  importCircleOfTrust,
  importCirclesOfTrust,
  importFirstCircleOfTrust,
} = frodo.saml2.circlesOfTrust;

/**
 * Get a one-line description of the circle of trust object
 * @param {CircleOfTrustSkeleton} cotObj circle of trust object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(cotObj: CircleOfTrustSkeleton): string {
  const description = `[${cotObj._id['brightCyan']}]`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Name/Id | Status | Trusted Providers |\n';
  markdown += '| ------- | ------ | ----------------- |';
  return markdown;
}

/**
 * Get a table-row of the circle of trust in markdown
 * @param {SocialIdpSkeleton} cotObj circle of trust object to describe
 * @returns {string} a table-row of the circle of trust in markdown
 */
export function getTableRowMd(cotObj: CircleOfTrustSkeleton): string {
  const row = `| ${cotObj._id} | ${
    cotObj.status === 'active'
      ? ':white_check_mark: `active`'
      : ':o: `inactive`'
  } | ${cotObj.trustedProviders
    .map((provider) => provider.split('|')[0])
    .join('<br>')} |`;
  return row;
}

/**
 * List entity providers
 * @param {String} long Long list format with details
 */
export async function listCirclesOfTrust(long = false): Promise<boolean> {
  let outcome = false;
  let cotList = [];
  try {
    cotList = await readCirclesOfTrust();
  } catch (error) {
    printMessage(`readCirclesOfTrust ERROR: ${error}`, 'error');
    printMessage(error, 'data');
  }
  cotList.sort((a, b) => a._id.localeCompare(b._id));
  if (!long) {
    cotList.forEach((cot) => {
      printMessage(`${cot._id}`, 'data');
    });
    outcome = true;
  } else {
    const table = createTable([
      'Name'['brightCyan'],
      'Description'['brightCyan'],
      'Status'['brightCyan'],
      'Trusted Providers'['brightCyan'],
    ]);
    cotList.forEach((cot) => {
      table.push([
        cot._id,
        cot.description,
        cot.status,
        cot.trustedProviders
          .map((provider) => provider.split('|')[0])
          .join('\n'),
      ]);
    });
    printMessage(table.toString(), 'data');
    outcome = true;
  }
  return outcome;
}

/**
 * Export a single circle of trust to file
 * @param {String} cotId circle of trust id/name
 * @param {String} file Optional filename
 */
export async function exportCircleOfTrustToFile(
  cotId: string,
  file: string = null
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.CirclesOfTrustOps.exportCircleOfTrustToFile: begin`);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Exporting ${cotId}...`
  );
  try {
    let fileName = getTypedFilename(cotId, 'cot.saml');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportCircleOfTrust(cotId);
    saveJsonToFile(exportData, filePath);
    stopProgressIndicator(
      indicatorId,
      `Exported ${cotId} to ${filePath}.`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting ${cotId}: ${error.message}`,
      'fail'
    );
  }
  debugMessage(`cli.CirclesOfTrustOps.exportCircleOfTrustToFile: end`);
  return outcome;
}

/**
 * Export all circles of trust to one file
 * @param {String} file Optional filename
 */
export async function exportCirclesOfTrustToFile(
  file: string = null
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.CirclesOfTrustOps.exportCirclesOfTrustToFile: begin`);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Exporting all circles of trust...`
  );
  try {
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}CirclesOfTrust`,
      'cot.saml'
    );
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportCirclesOfTrust();
    saveJsonToFile(exportData, filePath);
    stopProgressIndicator(
      indicatorId,
      `Exported all circles of trust to ${filePath}.`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting circles of trust: ${error.message}`,
      'fail'
    );
  }
  debugMessage(`cli.CirclesOfTrustOps.exportCirclesOfTrustToFile: end`);
  return outcome;
}

/**
 * Export all circles of trust to individual files
 */
export async function exportCirclesOfTrustToFiles(): Promise<boolean> {
  debugMessage(`cli.CirclesOfTrustOps.exportCirclesOfTrustToFiles: begin`);
  const errors = [];
  let indicatorId: string;
  try {
    const cots: CircleOfTrustSkeleton[] = await readCirclesOfTrust();
    indicatorId = createProgressIndicator(
      'determinate',
      cots.length,
      'Exporting circles of trust...'
    );
    for (const cot of cots) {
      const file = getTypedFilename(cot._id, 'cot.saml');
      try {
        const exportData: CirclesOfTrustExportInterface =
          await exportCircleOfTrust(cot._id);
        saveJsonToFile(exportData, getFilePath(file, true));
        updateProgressIndicator(indicatorId, `Exported ${cot.name}.`);
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(indicatorId, `Error exporting ${cot.name}.`);
      }
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(
      indicatorId,
      `Error exporting circles of trust to files`
    );
  }
  debugMessage(`cli.CirclesOfTrustOps.exportCirclesOfTrustToFiles: end`);
  return 0 === errors.length;
}

/**
 * Import a SAML circle of trust by id/name from file
 * @param {String} cotId Circle of trust id/name
 * @param {String} file Import file name
 */
export async function importCircleOfTrustFromFile(
  cotId: string,
  file: string
): Promise<boolean> {
  let outcome = false;
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing circle of trust ${cotId} from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importCircleOfTrust(cotId, fileData);
    outcome = true;
    stopProgressIndicator(
      indicatorId,
      `Imported circle of trust ${cotId} from ${filePath}.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing circle of trust ${cotId} from ${filePath}.`,
      'fail'
    );
    printMessage(error.response?.data || error, 'error');
  }
  return outcome;
}

/**
 * Import first SAML circle of trust from file
 * @param {String} file Import file name
 */
export async function importFirstCircleOfTrustFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing first circle of trust from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstCircleOfTrust(fileData);
    outcome = true;
    stopProgressIndicator(
      indicatorId,
      `Imported first circle of trust from ${filePath}.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing first circle of trust from ${filePath}.`,
      'fail'
    );
    printMessage(error.response?.data || error, 'error');
  }
  return outcome;
}

/**
 * Import all SAML circles of trust from file
 * @param {String} file Import file name
 */
export async function importCirclesOfTrustFromFile(
  file: string
): Promise<boolean> {
  let outcome = false;
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing circles of trust from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importCirclesOfTrust(fileData);
    outcome = true;
    stopProgressIndicator(
      indicatorId,
      `Imported circles of trust from ${filePath}.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing circles of trust from ${filePath}.`,
      'fail'
    );
    printMessage(error.response?.data || error, 'error');
  }
  return outcome;
}

/**
 * Import all SAML circles of trust from all *.cot.saml.json files in the current directory
 */
export async function importCirclesOfTrustFromFiles(): Promise<boolean> {
  const errors = [];
  let indicatorId: string;
  try {
    debugMessage(`cli.CirclesOfTrustOps.importCirclesOfTrustFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.cot.saml.json'))
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing circles of trust...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: CirclesOfTrustExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.saml.cot).length;
        total += count;
        await importCirclesOfTrust(fileData);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} circles of trust from ${file}`
        );
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error importing circles of trust from ${file}`
        );
        printMessage(error, 'error');
      }
    }
    stopProgressIndicator(
      indicatorId,
      `Imported ${total} circles of trust from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(
      indicatorId,
      `Error importing circles of trust from files.`
    );
    printMessage(error, 'error');
  }
  debugMessage(`cli.CirclesOfTrustOps.importCirclesOfTrustFromFiles: end`);
  return 0 === errors.length;
}
