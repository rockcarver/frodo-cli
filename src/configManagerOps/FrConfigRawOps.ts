import fs from 'fs';
import { readFile } from 'fs/promises';
import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  stopProgressIndicator,
  verboseMessage,
} from '../utils/Console';
import { clearOperationalAttributes } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { exportRawConfig, importRawConfig } = frodo.rawConfig;

/**
 * Export every item from the list in the provided json file
 * @returns True if each file was successfully exported
 */
export async function configManagerExportRaw(file: string): Promise<boolean> {
  try {
    const jsonData = JSON.parse(await readFile(file, { encoding: 'utf8' }));

    // Create export json file for every item in the provided json file
    for (const config of jsonData) {
      const response: IdObjectSkeletonInterface = await exportRawConfig(config);
      verboseMessage(`Saving ${response._id} at ${config.path}.json.`);
      saveJsonToFile(
        response,
        getFilePath(`raw/${config.path}.json`, true),
        false,
        true
      );
    }

    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import all raw configuration exported in fr-config-manager format
 * @param {string} path optional flag to import only the specific configuration
 * @param {boolean} stdin True to read config from stdin
 * @returns {Promise<boolean>} true if each file was successfully imported
 */
export async function configManagerImportRaw(
  path?: string,
  stdin = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing raw config...'
  );
  try {
    if (stdin) {
      const data = readJsonFile(process.stdin.fd) as IdObjectSkeletonInterface;
      clearOperationalAttributes(data);
      await importRawConfig({ path }, data);
      stopProgressIndicator(
        indicatorId,
        'Raw config import completed.',
        'success'
      );
      return true;
    }

    const rawDir = `${getWorkingDirectory()}/raw`;
    const files = getJsonFiles(rawDir);
    for (const filePath of files) {
      const rawPath = filePath
        .slice(rawDir.length)
        .replace(/\.json$/, '')
        .replace(/\\/g, '/');
      if (path && !rawPath.startsWith(path)) {
        continue;
      }

      const data = readJsonFile(filePath) as IdObjectSkeletonInterface;

      clearOperationalAttributes(data);
      await importRawConfig({ path: rawPath }, data);
    }
    stopProgressIndicator(
      indicatorId,
      'Raw config import completed.',
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Raw config import failes.', 'fail');
    printError(error, 'Raw import failed');
    return false;
  }
}

/**
 * Recursively walks a directory tree and returns the full paths of all .json files found.
 * @param {string} dir root directory to search
 * @returns {string[]} full paths of all .json files found
 */
function getJsonFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      results.push(...getJsonFiles(full));
    } else if (entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}
