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
