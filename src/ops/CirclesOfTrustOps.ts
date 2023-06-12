import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';
import {
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
import { CircleOfTrustSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';
import { CirclesOfTrustExportInterface } from '@rockcarver/frodo-lib/types/ops/OpsTypes';

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
    cotList = (await frodo.saml2.circlesOfTrust.getCirclesOfTrust()).result;
  } catch (error) {
    printMessage(`getCirclesOfTrust ERROR: ${error}`, 'error');
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
    printMessage(table.toString());
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
  showSpinner(`Exporting ${cotId}...`);
  try {
    let fileName = getTypedFilename(cotId, 'cot.saml');
    if (file) {
      fileName = file;
    }
    const exportData = await frodo.saml2.circlesOfTrust.exportCircleOfTrust(
      cotId
    );
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported ${cotId} to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting ${cotId}: ${error.message}`);
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
  showSpinner(`Exporting all circles of trust...`);
  try {
    let fileName = getTypedFilename(
      `all${titleCase(
        frodo.helper.utils.getRealmName(state.getRealm())
      )}CirclesOfTrust`,
      'cot.saml'
    );
    if (file) {
      fileName = file;
    }
    const exportData = await frodo.saml2.circlesOfTrust.exportCirclesOfTrust();
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported all circles of trust to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting circles of trust: ${error.message}`);
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
  try {
    const cots: CircleOfTrustSkeleton[] =
      await frodo.saml2.circlesOfTrust.getCirclesOfTrust();
    createProgressBar(cots.length, 'Exporting circles of trust...');
    for (const cot of cots) {
      const file = getTypedFilename(cot._id, 'cot.saml');
      try {
        const exportData: CirclesOfTrustExportInterface =
          await frodo.saml2.circlesOfTrust.exportCircleOfTrust(cot._id);
        saveJsonToFile(exportData, file);
        updateProgressBar(`Exported ${cot.name}.`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error exporting ${cot.name}.`);
      }
    }
    stopProgressBar(`Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error exporting circles of trust to files`);
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
  showSpinner(`Importing circle of trust ${cotId} from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      await frodo.saml2.circlesOfTrust.importCircleOfTrust(cotId, fileData);
      outcome = true;
      succeedSpinner(`Imported circle of trust ${cotId} from ${file}.`);
    } catch (error) {
      failSpinner(`Error importing circle of trust ${cotId} from ${file}.`);
      printMessage(error.response?.data || error, 'error');
    }
  });
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
  showSpinner(`Importing first circle of trust from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      await frodo.saml2.circlesOfTrust.importFirstCircleOfTrust(fileData);
      outcome = true;
      succeedSpinner(`Imported first circle of trust from ${file}.`);
    } catch (error) {
      failSpinner(`Error importing first circle of trust from ${file}.`);
      printMessage(error.response?.data || error, 'error');
    }
  });
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
  showSpinner(`Importing circles of trust from ${file}...`);
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    try {
      const fileData = JSON.parse(data);
      await frodo.saml2.circlesOfTrust.importCirclesOfTrust(fileData);
      outcome = true;
      succeedSpinner(`Imported circles of trust from ${file}.`);
    } catch (error) {
      failSpinner(`Error importing circles of trust from ${file}.`);
      printMessage(error.response?.data || error, 'error');
    }
  });
  return outcome;
}

/**
 * Import all SAML circles of trust from all *.cot.saml.json files in the current directory
 */
export async function importCirclesOfTrustFromFiles(): Promise<boolean> {
  const errors = [];
  try {
    debugMessage(`cli.CirclesOfTrustOps.importCirclesOfTrustFromFiles: begin`);
    const names = fs.readdirSync('.');
    const files = names.filter((name) =>
      name.toLowerCase().endsWith('.policy.authz.json')
    );
    createProgressBar(files.length, 'Importing circles of trust...');
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: CirclesOfTrustExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.saml.cot).length;
        total += count;
        await frodo.saml2.circlesOfTrust.importCirclesOfTrust(fileData);
        updateProgressBar(`Imported ${count} circles of trust from ${file}`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error importing circles of trust from ${file}`);
        printMessage(error, 'error');
      }
    }
    stopProgressBar(
      `Imported ${total} circles of trust from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error importing circles of trust from files.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.CirclesOfTrustOps.importCirclesOfTrustFromFiles: end`);
  return 0 === errors.length;
}
