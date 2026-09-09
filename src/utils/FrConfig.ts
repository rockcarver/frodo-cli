import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';
import sanitize from 'sanitize-filename';

const { readRealms } = frodo.realm;

const { findFilesByName } = frodo.utils;

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
  return encoded ? Buffer.from(value, 'base64').toString('utf8') : value;
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
