import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import sanitize from 'sanitize-filename';

const { readRealms } = frodo.realm;

const { findFilesByName, isBase64Encoded } = frodo.utils;

export async function realmList(): Promise<string[]> {
  const realms = await readRealms();
  return realms.map((r) => r.name);
}

export function safeFileName(filename: string): string {
  return sanitize(filename, {
    replacement: (character) => encodeURIComponent(character),
  });
}

export function safeFileNameUnderscore(filename: string): string {
  return sanitize(filename, {
    replacement: '_',
  });
}

export function escapePlaceholders<T>(content: T): T {
  return JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'));
}

export function esvToEnv(esv: string): string {
  return esv.toUpperCase().replace(/-/g, '_');
}

export function decodeOrNot(value: string, encoded: boolean): string {
  return encoded && isBase64Encoded(value)
    ? Buffer.from(value, 'base64').toString('utf8')
    : value;
}

export function encodeOrNot(value: string, encoded: boolean): string {
  return encoded ? Buffer.from(value).toString('base64') : value;
}

export function replaceAllInJson(
  content: object,
  replacements: { search: string | RegExp; replacement?: string }[]
) {
  let contentString = JSON.stringify(content);
  replacements.forEach(({ search, replacement }) => {
    contentString = contentString.split(search).join(replacement);
  });
  return JSON.parse(contentString);
}

export function existScript(fileName: string, realmDir: string): boolean {
  const scriptDir = `realms/${realmDir}/scripts/scripts-config`;
  if (!fs.existsSync(scriptDir)) return false;
  const result = findFilesByName(`${fileName}.json`, true, scriptDir);
  return result.length > 0;
}

export function clearOperationalAttributes(obj) {
  delete obj._id;
  delete obj._rev;
  delete obj._pushApiVersion;
  delete obj.createdBy;
  delete obj.creationDate;
  delete obj.lastModifiedBy;
  delete obj.lastModifiedDate;
}

/**
 * Check whether a script source-file path matches a filename filter.
 * @param {string} filename script source-file path
 * @param {string | boolean} filenameFilter comma-separated filters prefix an entry with ~ for a substring match
 * @returns True if the file matches or no filter was provided
 */
export function fileFilter(
  filename: string,
  filenameFilter?: string | boolean
): boolean {
  if (!filename || filenameFilter === undefined) {
    return true;
  }

  if (typeof filenameFilter === 'boolean' || filenameFilter.trim() === '') {
    return false;
  }

  return filenameFilter.split(',').some((entry) => {
    const filter = entry.trim();

    return filter.startsWith('~')
      ? filename.includes(filter.substring(1))
      : filename === filter;
  });
}

/**
 * Sleeps for a specified length of time
 * @param {number} ms number milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Escape a value for use as a CSV field
 * @param {string} value the value to escape
 * @returns {string} the value, quoted if needed; empty string if undefined
 */
export function csvEscape(value?: string): string {
  if (value === undefined || value === null) return '';
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Format an ISO timestamp as 'YYYY-MM-DD HH:MM:SS'
 * @param {string} timestamp ISO timestamp
 * @returns {string} formatted timestamp; empty string if undefined
 */
export function friendlyTimestamp(timestamp?: string): string {
  if (!timestamp) return '';
  return timestamp.slice(0, 19).replace('T', ' ');
}

/**
 * Merge function that mimics Lodash's merge (from config-manager).
 *
 * Claude description:
 *
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
export function lodashMerge(
  target: Record<string, unknown> | object,
  source: Record<string, unknown> | object
): Record<string, unknown> | object {
  if (!source) return target;
  for (const key of Object.keys(source)) {
    const s = source[key];
    const t = target[key];
    const bothPlainObjects =
      isPlainObject(s) && isPlainObject(t)
        ? true
        : Array.isArray(s) && Array.isArray(t);
    if (bothPlainObjects) {
      lodashMerge(t as Record<string, unknown>, s as Record<string, unknown>);
    } else {
      target[key] = s;
    }
  }
  return target;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
