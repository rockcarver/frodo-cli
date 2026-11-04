import { readFile } from 'fs/promises';
import { frodo, type ContentSecurityPolicy } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';
import { lodashMerge } from '../utils/FrConfig';

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
 * @param {string} name optional csp name to import
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportCsp(name?: string): Promise<boolean> {
  try {
    const importData = readJsonFile(getFilePath('csp/csp.json')) as CSPExport;
    if (!name || name === 'enforced')
      await updateEnforcedContentSecurityPolicy(importData.enforced);
    if (!name || name === 'report-only')
      await updateReportOnlyContentSecurityPolicy(importData['report-only']);
    if (name && name !== 'enforced' && name !== 'report-only') {
      throw new Error(
        `Invalid CSP name '${name}'. Valid values are 'enforced' or 'report-only'.`
      );
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
