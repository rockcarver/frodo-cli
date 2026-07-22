import { frodo } from '@rockcarver/frodo-lib';
import { ContentSecurityPolicy } from '@rockcarver/frodo-lib/types/api/cloud/EnvContentSecurityPolicyApi';
import { applyDiff } from 'deep-diff';
import fs from 'fs';
import { readFile } from 'fs/promises';

import { printError } from '../utils/Console';

const { env } = frodo.cloud;
const {
  updateEnforcedContentSecurityPolicy,
  updateReportOnlyContentSecurityPolicy,
} = frodo.cloud.env;
const { getFilePath, saveJsonToFile } = frodo.utils;

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
      applyDiff(
        csp,
        configFileData,
        (_source, _target, change) => change.kind !== 'D'
      );
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
    const cspFilePath = getFilePath('csp/csp.json');
    const cspFile = fs.readFileSync(cspFilePath, 'utf8');
    const importData = JSON.parse(cspFile);

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
