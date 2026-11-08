import fs from 'fs';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  frodo,
  FrodoError,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  verboseMessage,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { clearOperationalAttributes } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';
import { readStdinToEndSync } from '../utils/StdinSync';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { exportRawConfig, importRawConfig } = frodo.rawConfig;

/**
 * Export every item from the list in the provided json file
 * @param {string} file the json file that lists what to export
 * @param {boolean} allowFailures True to succeed although some items could not be exported (the failures are still summarised)
 * @returns {boolean} True if each file was successfully exported. An item that cannot be exported does not stop the others; the result is false if any failed, unless failures are allowed. A list that does not exist, cannot be parsed or is not a list is a failure.
 */
export async function configManagerExportRaw(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    if (!fs.existsSync(file)) {
      printMessage(`The raw config file '${file}' does not exist.`, 'error');
      return false;
    }
    const jsonData = JSON.parse(await readFile(file, { encoding: 'utf8' }));
    if (!Array.isArray(jsonData)) {
      printMessage(
        `The raw config file '${file}' must contain a list of items to export, each with a "path".`,
        'error'
      );
      return false;
    }

    // Create export json file for every item in the provided json file
    const run = new OperationRun({ unit: 'raw config', allowFailures });
    for (const config of jsonData) {
      const name = String(config?.path ?? JSON.stringify(config));
      try {
        const response: IdObjectSkeletonInterface =
          await exportRawConfig(config);
        verboseMessage(`Saving ${response._id} at ${config.path}.json.`);
        saveJsonToFile(
          response,
          getFilePath(`raw/${config.path}.json`, true),
          false,
          true
        );
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting raw config '${name}'`);
        run.recordFailure(name, causeOf(error));
      }
    }

    return run.finish();
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * The raw configuration piped in on standard input.
 *
 * The text is read by the shared stdin helper (`utils/StdinSync.ts`), which
 * waits for a slow producer instead of failing with EAGAIN, and then goes
 * through frodo-lib's `readJsonFile` like any config file, so placeholders
 * are resolved exactly as they are for files. `readJsonFile` only takes a
 * path or a file descriptor, hence the short-lived private file (a 0700
 * directory, a 0600 file, removed again in every case).
 */
function readRawConfigFromStdin(): IdObjectSkeletonInterface {
  const text = readStdinToEndSync();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frodo-stdin-'));
  try {
    const file = path.join(dir, 'stdin.json');
    fs.writeFileSync(file, text, { mode: 0o600 });
    return readJsonFile(file) as IdObjectSkeletonInterface;
  } catch (error) {
    throw new FrodoError('Error reading JSON from stdin', error);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Import all raw configuration exported in fr-config-manager format
 * @param {string} path optional flag to import only the specific configuration
 * @param {boolean} stdin True to read config from stdin
 * @param {boolean} allowFailures True to succeed although some files could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} true if each file was successfully imported. A file that cannot be imported does not stop the others; the result is false if any failed, unless failures are allowed. A path that matches no file, and a config folder without a raw folder, fail the command whatever the option says. Standard input is one configuration: if it fails, the result is false whatever the option.
 */
export async function configManagerImportRaw(
  path?: string,
  stdin = false,
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing raw config...'
  );
  try {
    if (stdin) {
      const data = readRawConfigFromStdin();
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
    if (!fs.existsSync(rawDir)) {
      stopProgressIndicator(
        indicatorId,
        `There is no 'raw' folder in '${getWorkingDirectory()}', so there is no raw config to push.`,
        'fail'
      );
      return false;
    }
    const run = new OperationRun({ unit: 'raw config', allowFailures });
    let matched = false;
    const files = getJsonFiles(rawDir);
    for (const filePath of files) {
      const rawPath = filePath
        .slice(rawDir.length)
        .replace(/\.json$/, '')
        .replace(/\\/g, '/');
      if (path && !rawPath.startsWith(path)) {
        continue;
      }
      matched = true;

      try {
        const data = readJsonFile(filePath) as IdObjectSkeletonInterface;

        clearOperationalAttributes(data);
        await importRawConfig({ path: rawPath }, data);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Raw import of '${rawPath}' failed`);
        run.recordFailure(rawPath, causeOf(error));
      }
    }
    const noMatch = !!path && !matched;
    if (noMatch) {
      printMessage(
        `No raw config in '${rawDir}' matches the path '${path}'. The path is that of the config in the tenant, for example /openidm/config/cluster.`,
        'error'
      );
    }
    const failed = run.hasFailures || noMatch;
    stopProgressIndicator(
      indicatorId,
      failed
        ? 'Raw config import finished with errors.'
        : 'Raw config import completed.',
      failed ? 'fail' : 'success'
    );
    // a path that matches nothing is not an operation that failed among others:
    // it fails the command whatever --allow-failures says
    return run.finish() && !noMatch;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Raw config import failed.', 'fail');
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
