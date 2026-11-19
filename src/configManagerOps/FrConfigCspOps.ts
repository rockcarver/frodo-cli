import fs from 'fs';
import { readFile } from 'fs/promises';
import { frodo, type ContentSecurityPolicy } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { lodashMerge } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { env } = frodo.cloud;
const {
  updateEnforcedContentSecurityPolicy,
  updateReportOnlyContentSecurityPolicy,
} = frodo.cloud.env;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

type CSPExport = {
  enforced: ContentSecurityPolicy;
  'report-only': ContentSecurityPolicy;
};

/**
 * Export the content security policy in fr-config manager format
 * @param {string} file optional file to be exported
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportCsp(
  file: string = null
): Promise<boolean> {
  try {
    const cspEnforced: ContentSecurityPolicy =
      await env.readEnforcedContentSecurityPolicy();
    const cspReport: ContentSecurityPolicy =
      await env.readReportOnlyContentSecurityPolicy();
    const csp = { enforced: cspEnforced, 'report-only': cspReport };

    if (file) {
      const configFileData = JSON.parse(
        await readFile(file, { encoding: 'utf8' })
      );
      lodashMerge(csp, configFileData);
    }

    saveJsonToFile(csp, getFilePath('csp/csp.json', true), false, true);
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import the content security policy in fr-config manager format
 * The enforced and the report-only policy are two operations of an {@link OperationRun}: a policy
 * that cannot be updated is printed and named in one summary, and the other policy is still
 * updated. A missing or unreadable file and a name that is neither policy end the command whatever
 * `--allow-failures` says.
 * @param {string} name optional csp name to import
 * @param {boolean} allowFailures true to report a policy that could not be updated but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportCsp(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    if (name && name !== 'enforced' && name !== 'report-only') {
      throw new Error(
        `Invalid CSP name '${name}'. Valid values are 'enforced' or 'report-only'.`
      );
    }
    const cspFile = getFilePath('csp/csp.json');
    if (!fs.existsSync(cspFile)) {
      printMessage(`No CSP file found: ${cspFile} does not exist.`, 'error');
      return false;
    }
    const importData = readJsonFile(cspFile) as CSPExport;
    const run = new OperationRun({ unit: 'policy', allowFailures });
    if (!name || name === 'enforced')
      await run.run('enforced', async () => {
        await updateEnforcedContentSecurityPolicy(importData.enforced);
      });
    if (!name || name === 'report-only')
      await run.run('report-only', async () => {
        await updateReportOnlyContentSecurityPolicy(importData['report-only']);
      });
    return run.finish();
  } catch (error) {
    printError(error);
    return false;
  }
}
