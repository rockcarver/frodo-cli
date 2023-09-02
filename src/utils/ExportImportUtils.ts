import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';
import { lstat, readdir, readFile } from 'fs/promises';
import { join } from 'path';
import slugify from 'slugify';

import { printMessage } from './Console';

const { stringify, deleteDeepByKey } = frodo.utils.json;

/**
 * find all (nested) files in a directory
 *
 * @param baseDirectory directory to search
 * @param childDirectory subdirectory to search
 * @returns list of files
 */
export async function readFiles(
  baseDirectory: string,
  childDirectory = ''
): Promise<
  {
    path: string;
    content: string;
  }[]
> {
  const targetDirectory = join(baseDirectory, childDirectory);
  const directoryItems = await readdir(targetDirectory);
  const childPaths = directoryItems.map((item) => join(childDirectory, item));

  const filePathsNested = await Promise.all(
    childPaths.map(async (childPath) => {
      const path = join(baseDirectory, childPath);
      const isDirectory = (await lstat(path)).isDirectory();

      if (isDirectory) {
        return readFiles(baseDirectory, childPath);
      }

      return {
        path: childPath,
        content: await readFile(path, 'utf8'),
      };
    })
  );

  return filePathsNested.flat();
}

const { getMetadata } = frodo.utils;

/**
 * Get a typed filename. E.g. "my-script.script.json"
 *
 * @param name The name of the file
 * @param type The type of the file, e.g. script, idp, etc.
 * @param suffix The suffix of the file, e.g. json, xml, etc. Defaults to json.
 * @returns The typed filename
 */
export function getTypedFilename(
  name: string,
  type: string,
  suffix = 'json'
): string {
  const slug = slugify(name.replace(/^http(s?):\/\//, ''));
  return `${slug}.${type}.${suffix}`;
}

/**
 * Save JSON object to file
 *
 * @param data data object
 * @param filename file name
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function saveJsonToFile(data: any, filename: string) {
  const exportData = data;
  if (!exportData.meta) {
    exportData.meta = getMetadata();
  }
  deleteDeepByKey(exportData, '_rev');
  fs.writeFile(filename, stringify(exportData), (err) => {
    if (err) {
      return printMessage(`ERROR - can't save ${filename}`, 'error');
    }
    return '';
  });
}

export function saveToFile(type, data, identifier, filename) {
  const exportData = {};
  exportData['meta'] = getMetadata();
  exportData[type] = {};

  if (Array.isArray(data)) {
    data.forEach((element) => {
      exportData[type][element[identifier]] = element;
    });
  } else {
    exportData[type][data[identifier]] = data;
  }
  deleteDeepByKey(exportData, '_rev');
  fs.writeFile(filename, stringify(exportData), (err) => {
    if (err) {
      return printMessage(`ERROR - can't save ${type} to file`, 'error');
    }
    return '';
  });
}

/**
 * Save text data to file
 * @param data text data
 * @param filename file name
 * @return true if successful, false otherwise
 */
export function saveTextToFile(data: string, filename: string): boolean {
  try {
    fs.writeFileSync(filename, data);
    return true;
  } catch (error) {
    printMessage(`ERROR - can't save ${filename}`, 'error');
    return false;
  }
}

/*
 * Output str in title case
 *
 * e.g.: 'ALL UPPERCASE AND all lowercase' = 'All Uppercase And All Lowercase'
 */
export function titleCase(input) {
  const str = input.toString();
  const splitStr = str.toLowerCase().split(' ');
  for (let i = 0; i < splitStr.length; i += 1) {
    splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].slice(1);
  }
  return splitStr.join(' ');
}

export function getRealmString() {
  const realm = state.getRealm();
  return realm
    .split('/')
    .reduce((result, item) => `${result}${titleCase(item)}`, '');
}
