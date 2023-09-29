import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';
import { lstat, readdir, readFile } from 'fs/promises';
import { join } from 'path';

import { printMessage } from './Console';

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

const {
  getMetadata,
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  titleCase,
  getRealmString,
} = frodo.utils;

export {
  getMetadata,
  getRealmString,
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  titleCase,
};

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
