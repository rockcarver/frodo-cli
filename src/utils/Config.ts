import { frodo, state } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import {
  FullExportInterface,
  FullGlobalExportInterface,
  FullRealmExportInterface,
} from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import { ExportMetaData } from '@rockcarver/frodo-lib/types/ops/OpsTypes';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { readServersFromFiles } from '../ops/classic/ServerOps';
import {
  getManagedObjectsFromFiles,
  resolveAllExtractedScriptsForImport,
} from '../ops/IdmOps';
import {
  getLegacyMappingsFromFiles,
  getNewMappingsFromFiles,
} from '../ops/MappingOps';
import { getScriptExportByScriptFile } from '../ops/ScriptOps';
import { errorHandler } from '../ops/utils/OpsUtils';
import { printMessage } from './Console';

const { getFilePath, readFiles, saveTextToFile, saveJsonToFile } = frodo.utils;

const { exportFullConfiguration } = frodo.config;

const { getDefaultNoiseFilter } = frodo.cloud.log;
const { IDM_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

export const FRODO_CONFIG_PATH_KEY = 'FRODO_CONFIG_PATH';
export const FRODO_LOG_NOISEFILTER_FILENAME = 'LoggingNoiseFilter.json';

export function getConfigPath(): string {
  return process.env[FRODO_CONFIG_PATH_KEY] || `${os.homedir()}/.frodo`;
}

function getCustomNoiseFilters(): Array<string> {
  const filename = `${getConfigPath()}/${FRODO_LOG_NOISEFILTER_FILENAME}`;
  let noiseFilter = [];
  try {
    const data = fs.readFileSync(filename, 'utf8');
    noiseFilter = JSON.parse(data);
  } catch (e) {
    printMessage(`Error reading ${filename} (${e.message})`, 'error');
  }
  return noiseFilter;
}

export function getNoiseFilters(defaults: boolean): Array<string> {
  const filename = `${getConfigPath()}/${FRODO_LOG_NOISEFILTER_FILENAME}`;
  if (defaults) {
    printMessage(`Using default logging noise filters.`, 'info');
    return getDefaultNoiseFilter();
  }
  let noiseFilter = getCustomNoiseFilters();
  if (noiseFilter.length == 0) {
    printMessage(`No custom noise filters defined. Using defaults.`, 'info');
    noiseFilter = getDefaultNoiseFilter();
    try {
      fs.writeFileSync(filename, JSON.stringify(noiseFilter, null, 2));
      printMessage(
        `The default filters were saved in ${filename}. You can change the filters as needed.`,
        'info'
      );
    } catch (e) {
      printMessage(
        `Error creating noise filter configuration with default values.`,
        'error'
      );
    }
  }
  return noiseFilter;
}

/**
 * Gets the full export config from one of three locations:
 * 1. The file passed into the function if one is provided.
 * 2. The working directory if it exists (provided by the user)
 * 3. From deployment (e.g. cloud) if the exports are not locally provided
 * @param file The optional file path
 * @returns The full export config
 */
export async function getFullExportConfig(
  file: string | null = null
): Promise<FullExportInterface> {
  // Get export from file if it exists
  if (file) {
    return JSON.parse(fs.readFileSync(getFilePath(file), 'utf8'));
  }
  // If working directory doesn't exist, export from the cloud
  const workingDirectory = state.getDirectory();
  if (!workingDirectory) {
    return await exportFullConfiguration(
      {
        useStringArrays: true,
        noDecode: false,
        coords: true,
        includeDefault: true,
        includeActiveValues: false,
        target: '',
        includeReadOnly: true,
        onlyRealm: false,
        onlyGlobal: false,
      },
      errorHandler
    );
  }
  // Go through files in the working directory and reconstruct the full export
  return await getFullExportConfigFromDirectory(workingDirectory);
}

/**
 * Reconstructs the full export config from files in the given directory
 * @param directory The directory
 * @return The full export config
 */
export async function getFullExportConfigFromDirectory(
  directory: string
): Promise<FullExportInterface> {
  let realms = {} as string[];
  let realmInterface;
  if (state.getDeploymentType() !== IDM_DEPLOYMENT_TYPE_KEY) {
    realms = fs.readdirSync(directory + '/realm');
    realmInterface = Object.fromEntries(
      realms.map((r) => [r, {} as FullRealmExportInterface])
    );
  }
  const fullExportConfig: FullExportInterface = {
    meta: {} as ExportMetaData,
    global: {} as unknown as FullGlobalExportInterface,
    realm: realmInterface,
  } as FullExportInterface;
  // Get global
  await getConfig(fullExportConfig.global, undefined, directory + '/global');
  // Get realms
  if (state.getDeploymentType() !== IDM_DEPLOYMENT_TYPE_KEY) {
    for (const realm of realms) {
      await getConfig(
        fullExportConfig.realm[realm],
        undefined,
        directory + '/realm/' + realm
      );
    }
  }
  return fullExportConfig;
}

/**
 * Helper method that gets all the config from a directory or file.
 * @param exportConfig The export object to store the config in
 * @param file The file to get config from
 * @param directory The directory to get config from
 */
export async function getConfig(
  exportConfig: FullGlobalExportInterface | FullRealmExportInterface,
  file?: string,
  directory?: string
): Promise<void> {
  if (!file && !directory) {
    return;
  }
  if (!directory && file) {
    directory = file.substring(0, file.lastIndexOf('/'));
  }
  const fileName = file ? file.substring(file.lastIndexOf('/') + 1) : undefined;
  const files = (await readFiles(directory)).filter(
    (f) => !fileName || f.path.endsWith(fileName)
  );
  const jsonFiles = files.filter((f) => f.path.endsWith('.json'));
  const samlFiles = jsonFiles.filter((f) => f.path.endsWith('.saml.json'));
  const scriptFiles = jsonFiles.filter((f) => f.path.endsWith('.script.json'));
  const mappingFiles = jsonFiles.filter((f) =>
    f.path.endsWith('.mapping.json')
  );
  const serverFiles = jsonFiles.filter(
    (f) =>
      f.path.endsWith('.server.json') &&
      !f.path.endsWith('.properties.server.json')
  );
  const idmFiles = jsonFiles.filter(
    (f) =>
      f.path.endsWith('idm.json') &&
      !f.path.endsWith('/sync.idm.json') &&
      !f.path.endsWith('sync.json') &&
      !f.path.endsWith('/managed.idm.json') &&
      !f.path.endsWith('managed.json') &&
      !f.path.endsWith('mapping.idm.json')
  );

  const allOtherFiles = jsonFiles.filter(
    (f) =>
      !f.path.endsWith('.saml.json') &&
      !f.path.endsWith('.script.json') &&
      !f.path.endsWith('.server.json') &&
      !f.path.endsWith('/sync.idm.json') &&
      !f.path.endsWith('sync.json') &&
      !f.path.endsWith('/managed.idm.json') &&
      !f.path.endsWith('managed.json') &&
      !f.path.endsWith('idm.json')
  );

  // Handle all other json files
  for (const f of allOtherFiles) {
    for (const [id, value] of Object.entries(
      JSON.parse(f.content) as Record<string, Record<string, object>>
    )) {
      if (id === 'meta') {
        continue;
      }
      if (!exportConfig[id]) {
        exportConfig[id] = value;
      } else {
        Object.entries(value).forEach(([key, val]) => {
          exportConfig[id][key] = val;
        });
      }
    }
  }
  for (const f of idmFiles) {
    const baseDirOfThisJson = path.dirname(f.path);
    const parsed = JSON.parse(f.content);
    if (!parsed.idm) continue;

    const entities = Object.values(
      parsed.idm
    ) as unknown as IdObjectSkeletonInterface[];
    for (const entity of entities) {
      resolveAllExtractedScriptsForImport(entity, baseDirOfThisJson);
      if (!(exportConfig as FullGlobalExportInterface).idm) {
        (exportConfig as FullGlobalExportInterface).idm = {};
      }
      (exportConfig as FullGlobalExportInterface).idm[entity._id] = entity;
    }
  }
  // Handle sync files
  const sync = await getLegacyMappingsFromFiles(jsonFiles);
  if (sync.mappings.length > 0) {
    (exportConfig as FullGlobalExportInterface).sync = sync;
  }
  if (mappingFiles.length > 0) {
    const mapping = await getNewMappingsFromFiles(mappingFiles);
    (exportConfig as FullGlobalExportInterface).mapping = mapping;
  }

  const managed = await getManagedObjectsFromFiles(jsonFiles);
  if (managed.objects.length > 0) {
    (exportConfig as FullGlobalExportInterface).idm.managed = managed;
  }

  // Handle saml files
  if (
    samlFiles.length > 0 &&
    !(exportConfig as FullRealmExportInterface).saml
  ) {
    (exportConfig as FullRealmExportInterface).saml = {
      hosted: {},
      remote: {},
      metadata: {},
      cot: {},
    };
  }
  for (const f of samlFiles) {
    let content = JSON.parse(f.content);
    content = content.saml;
    if (!(exportConfig as FullRealmExportInterface).saml) {
      (exportConfig as FullRealmExportInterface).saml = {
        hosted: {},
        remote: {},
        metadata: {},
        cot: {},
      };
    }
    for (const [id, value] of Object.entries(
      content as Record<string, object>
    )) {
      if (!(exportConfig as FullRealmExportInterface).saml[id]) {
        (exportConfig as FullRealmExportInterface).saml[id] = value;
      } else {
        Object.entries(value).forEach(
          ([key, val]) =>
            ((exportConfig as FullRealmExportInterface).saml[id][key] = val)
        );
      }
    }
  }
  // Handle server files
  (exportConfig as FullGlobalExportInterface).server =
    readServersFromFiles(serverFiles);
  // Handle extracted scripts
  if (
    scriptFiles.length > 0 &&
    !(exportConfig as FullRealmExportInterface).script
  ) {
    (exportConfig as FullRealmExportInterface).script = {};
  }
  for (const f of scriptFiles) {
    const scriptExport = getScriptExportByScriptFile(f.path);
    Object.entries(scriptExport.script).forEach(([id, script]) => {
      (exportConfig as FullRealmExportInterface).script[id] = script;
    });
  }
}

/**
 * Extracts data to a file
 * @param {any} data The data to extract
 * @param {string} file The relative file path to the directory
 * @param {string} directory The directory within the base directory to start. If not provided, defaults to base directory.
 * @returns the extracted file path
 */
export function extractDataToFile(
  data: any,
  file: string,
  directory?: string,
): string {
  const filePath = getFilePath((directory ? `${directory}/` : '') + file, true);
  if (typeof data === 'object') {
    saveJsonToFile(data, filePath, false);
  } else {
    saveTextToFile(String(data), filePath);
  }
  return `file://${file}`;
}

/**
 * Gets extracted data from a file as a string
 * @param extractedPath The file path where data was extracted
 * @param directory The directory where the extractedPath is located
 * @returns The extracted data as a string
 */
export function getExtractedData(
  extractedPath: string,
  directory?: string
): string {
  if (
    typeof extractedPath === 'string' &&
    extractedPath.startsWith('file://')
  ) {
    const filePath = `${directory || '.'}/${extractedPath.replace('file://', '')}`;
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
}

/**
 * Gets extracted data from a file as a JSON object
 * @param extractedPath The file path where data was extracted
 * @param directory The directory where the extractedPath is located
 * @returns The extracted data as a JSON object
 */
export function getExtractedJsonData(
  extractedPath: string,
  directory: string
): object {
  return JSON.parse(getExtractedData(extractedPath, directory));
}

/**
 * Determines all locations where a string id is being used anywhere within the given configuration object
 * @param {object} configuration The configuration object
 * @param {string} id The id being searched for
 * @param {boolean} isEsv Whether the id corresponds to an ESV or not
 * @returns {string[]} an array of locations where the id is being used
 */
export function getIdLocations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configuration: object,
  id: string,
  isEsv: boolean
): string[] {
  return getIdLocationsRecurse(
    configuration,
    isEsv
      ? // For ESV ids, they contain either letters, numbers, dashes, or underscores. The dashes get replaced with periods (escaped with a \ for the regex)
        // since anywhere they are being used they will be used with periods, not dashes. Note that the (?:[^a-z0-9._]|$) expressions at the beginning and
        // end are meant to ensure that the id found is not a substring of some other id (i.e. the id found must either be at the beginning or end of the
        // string, or if in the middle of a string, is not preceded or followed by a character that would be part of another id).
        new RegExp(
          `(?:[^a-z0-9._]|^)${id.replaceAll('-', '\\.')}(?:[^a-z0-9._]|$)`
        )
      : // For normal ids, they contain only letters, numbers, or dashes.
        new RegExp(`(?:[^a-z0-9-]|^)${id}(?:[^a-z0-9-]|$)`)
  );
}

/**
 * Recursive helper for getIdLocations that finds locations of any strings contained in the configuration that pass the regex
 * @param {any} configuration The configuration (could be anything)
 * @param {RegExp} regex The regex test
 * @returns {string[]} an array of locations where the id is found
 */
function getIdLocationsRecurse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configuration: any,
  regex: RegExp
): string[] {
  let locations = [];
  const type = typeof configuration;
  if (type === 'object' && configuration !== null) {
    for (const [id, value] of Object.entries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configuration as Record<string, any>
    )) {
      const usedLocations = getIdLocationsRecurse(value, regex);
      // Updates the relative locations of each place the id is used
      const updatedLocations = usedLocations.map(
        (loc) =>
          id +
          (value.name ? `(name: '${value.name}')` : '') +
          (loc === '' ? '' : '.') +
          loc
      );
      locations = locations.concat(updatedLocations);
    }
  }
  // This if statement determines whether or not the id is used in this configuration. If it is, return an empty string for its relative location.
  else if (type === 'string' && regex.test(configuration)) {
    locations.push('');
  }
  return locations;
}
