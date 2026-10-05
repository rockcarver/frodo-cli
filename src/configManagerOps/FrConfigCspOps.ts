import fs from 'fs';
import { readFile } from 'fs/promises';
import { frodo, type ContentSecurityPolicy } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { env } = frodo.cloud;
const {
  updateEnforcedContentSecurityPolicy,
  updateReportOnlyContentSecurityPolicy,
} = frodo.cloud.env;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Merge `source` into `target`, mirroring deep-diff's
 * `applyDiff(target, source, (s, t, change) => change.kind !== 'D')` — the
 * semantics this function relied on before deep-diff was dropped
 * (unmaintained since 2018):
 *
 * - every key present in `source` wins, including when its type differs from
 *   the target's (scalar → object and object → scalar both overwrite);
 * - keys present only in `target` are left untouched (deletions filtered);
 * - objects and arrays recurse per key/index (element-wise).
 *
 * frodo-lib's `mergeDeep` was evaluated as a replacement and rejected: it
 * cannot overwrite a scalar target with an object source (it recurses into
 * the scalar and throws "Cannot create property ... on boolean").
 */
function mergeOver(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const s = source[key];
    const t = target[key];
    const bothPlainObjects =
      isPlainObject(s) && isPlainObject(t)
        ? true
        : Array.isArray(s) && Array.isArray(t);
    if (bothPlainObjects) {
      mergeOver(t as Record<string, unknown>, s as Record<string, unknown>);
    } else {
      target[key] = s;
    }
  }
  return target;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
      mergeOver(csp, configFileData);
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
