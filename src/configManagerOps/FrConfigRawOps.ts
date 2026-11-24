import fs from 'fs';
import { readFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  frodo,
  FrodoError,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import { pulledFilePath, PulledPaths } from '../utils/ConfigTreePath';
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

/** The API version that a later push of a raw configuration sends, as the library reads it. */
type PushApiVersion = { protocol: string; resource: string };

/** The same path with or without its leading slash is the same path, as it is for the library. */
const withoutLeadingSlash = (value: unknown): string =>
  String(value).replace(/^\//, '');

/**
 * What to pull: the list of the file as it is, or the one item that `--path` names.
 * When the file lists the path, its item is pulled with its overrides and its push API
 * version; otherwise the path is pulled as it is. A push API version given on the command
 * line wins over the one of the item.
 * @param {any[] | undefined} list the items of the config file, if there is one
 * @param {string} path the API path that was asked for, if any
 * @param {PushApiVersion} pushApiVersion the push API version given on the command line, if any
 * @returns {any[]} the items to pull, in order
 */
function itemsToPull(
  list: any[] | undefined,
  path: string | undefined,
  pushApiVersion: PushApiVersion | undefined
): any[] {
  if (path === undefined) return list ?? [];
  const listed = list?.find(
    (item) =>
      item?.path !== undefined &&
      withoutLeadingSlash(item.path) === withoutLeadingSlash(path)
  );
  return [
    {
      ...(listed ?? { path }),
      ...(pushApiVersion && { pushApiVersion }),
    },
  ];
}

/**
 * Export every item from the list in the provided json file, or the one item of an API path
 * @param {string} file the json file that lists what to export; optional when a path is given
 * @param {boolean} allowFailures True to succeed although some items could not be exported (the failures are still summarised)
 * @param {string} path the API path of the one item to export. When the file lists it, the item of the file is used with its overrides and push API version
 * @param {boolean} stdout True to print the configuration as JSON on standard output instead of writing files: the object itself for a path, one list in the order of the file otherwise
 * @param {PushApiVersion} pushApiVersion the push API version to record in the item of a path, which a later push sends
 * @returns {boolean} True if each file was successfully exported. An item that cannot be exported does not stop the others; the result is false if any failed, unless failures are allowed. A list that does not exist, cannot be parsed or is not a list is a failure.
 */
export async function configManagerExportRaw(
  file: string | undefined,
  allowFailures: boolean = false,
  path?: string,
  stdout: boolean = false,
  pushApiVersion?: PushApiVersion
): Promise<boolean> {
  try {
    let list: any[] | undefined;
    if (file !== undefined) {
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
      list = jsonData;
    } else if (path === undefined) {
      printMessage(
        'Give the API path to export with --path, or a config file with --config-file.',
        'error'
      );
      return false;
    }

    // Create export json file for every item to export
    const run = new OperationRun({ unit: 'raw config', allowFailures });
    const pulledPaths = new PulledPaths();
    const printed: IdObjectSkeletonInterface[] = [];
    for (const config of itemsToPull(list, path, pushApiVersion)) {
      const name = String(config?.path ?? JSON.stringify(config));
      try {
        pulledPaths.owner = String(config?.path);
        const response: IdObjectSkeletonInterface =
          await exportRawConfig(config);
        if (stdout) {
          printed.push(response);
        } else {
          verboseMessage(`Saving ${response._id} at ${config.path}.json.`);
          saveJsonToFile(
            response,
            // the path is a path by design (`/openidm/config/cluster`), and it stays inside the config folder
            getFilePath(
              pulledFilePath(`raw/${config.path}.json`, pulledPaths),
              true
            ),
            false,
            true
          );
        }
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting raw config '${name}'`);
        run.recordFailure(name, causeOf(error));
      }
    }

    // standard input of the next command: one JSON document and nothing else
    if (stdout && (path === undefined || printed.length > 0)) {
      printMessage(
        JSON.stringify(path === undefined ? printed : printed[0], null, 2),
        'data'
      );
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
 * Removes the attributes that a push must not send, but keeps `_pushApiVersion`: the library
 * reads it to set the API version of the request and takes it out of what it sends.
 * @param {IdObjectSkeletonInterface} data the configuration read from a file or from standard input
 */
function clearForPush(data: IdObjectSkeletonInterface): void {
  const pushApiVersion = data._pushApiVersion;
  clearOperationalAttributes(data);
  if (pushApiVersion !== undefined) data._pushApiVersion = pushApiVersion;
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
      clearForPush(data);
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

        clearForPush(data);
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
