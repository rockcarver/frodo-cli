import { frodo } from '@rockcarver/frodo-lib';
import { ContentSecurityPolicy } from '@rockcarver/frodo-lib/src/api/cloud/EnvContentSecurityPolicyApi';

import { printError } from '../utils/Console';

const { env } = frodo.cloud;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export the content security policy in fr-config manager format
 * @returns
 */
export async function exportCsp(): Promise<boolean> {
  try {
    const cspEnforced: ContentSecurityPolicy = await env.readEnforcedContentSecurityPolicy();
    const cspReport: ContentSecurityPolicy = await env.readReportOnlyContentSecurityPolicy();
    const csp = {enforced: cspEnforced, 'report-only' : cspReport};
    saveJsonToFile(
      csp,
      getFilePath('csp/csp.json', true),
      false,
      false
    );
    return true;
  } catch (error) {
    printError(error);
  }
}
