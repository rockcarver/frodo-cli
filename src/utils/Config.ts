import { frodo, state } from '@rockcarver/frodo-lib';
import { AuthenticationSettingsSkeleton } from '@rockcarver/frodo-lib/types/api/AuthenticationSettingsApi';
import {
  FullExportInterface,
  FullGlobalExportInterface,
  FullRealmExportInterface,
} from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import { ExportMetaData } from '@rockcarver/frodo-lib/types/ops/OpsTypes';
import fs from 'fs';
import os from 'os';

import { getIdmImportDataFromIdmDirectory } from '../ops/IdmOps';
import { getLegacyMappingsFromFiles } from '../ops/MappingOps';
import { getScriptExportByScriptFile } from '../ops/ScriptOps';
import { printMessage } from './Console';

const { getFilePath, readFiles } = frodo.utils;

const { exportFullConfiguration } = frodo.config;

const { getDefaultNoiseFilter } = frodo.cloud.log;

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
    return await exportFullConfiguration({
      useStringArrays: true,
      noDecode: false,
      coords: true,
      includeDefault: true,
      includeActiveValues: false,
      target: '',
    });
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
  const realms = fs.readdirSync(directory + '/realm');
  const fullExportConfig: FullExportInterface = {
    meta: {} as ExportMetaData,
    global: {
      emailTemplate: {},
      idm: {},
      mapping: {},
      secrets: {},
      service: {},
      sync: {
        id: 'sync',
        mappings: [],
      },
      variables: {},
    },
    realm: Object.fromEntries(
      realms.map((r) => [
        r,
        {
          agents: {},
          application: {},
          authentication: {} as AuthenticationSettingsSkeleton,
          idp: {},
          managedApplication: {},
          policy: {},
          policyset: {},
          resourcetype: {},
          saml: {
            hosted: {},
            remote: {},
            metadata: {},
            cot: {},
          },
          script: {},
          service: {},
          theme: {},
          trees: {},
        },
      ])
    ),
  } as FullExportInterface;
  // Get global
  await getConfigFromDirectory(directory + '/global', fullExportConfig.global);
  // Get realms
  for (const realm of realms) {
    await getConfigFromDirectory(
      directory + '/realm/' + realm,
      fullExportConfig.realm[realm]
    );
  }
  return fullExportConfig;
}

async function getConfigFromDirectory(
  directory: string,
  exportConfig: FullGlobalExportInterface | FullRealmExportInterface
) {
  if (directory.startsWith('./')) {
    directory = directory.substring(2);
  }
  const samlPath = `${directory}/saml/`;
  const cotPath = `${directory}/cot/`;
  const idmPath = `${directory}/idm/`;
  const syncPath = `${directory}/sync/`;
  const scriptPath = `${directory}/script/`;

  const files = await readFiles(directory);
  const jsonFiles = files.filter((f) => f.path.endsWith('.json'));
  const samlFiles = jsonFiles.filter(
    (f) => f.path.startsWith(samlPath) || f.path.startsWith(cotPath)
  );
  const syncFiles = jsonFiles.filter((f) => f.path.startsWith(syncPath));
  const scriptFiles = jsonFiles.filter((f) => f.path.endsWith('.script.json'));
  const allOtherFiles = jsonFiles.filter(
    (f) =>
      !f.path.startsWith(samlPath) &&
      !f.path.startsWith(cotPath) &&
      !f.path.startsWith(idmPath) &&
      !f.path.startsWith(syncPath) &&
      !f.path.startsWith(scriptPath)
  );
  // Handle all other json files
  for (const f of allOtherFiles) {
    for (const [id, value] of Object.entries(
      JSON.parse(f.content) as Record<string, Record<string, object>>
    )) {
      if (id === 'meta') {
        continue;
      }
      if (exportConfig[id] == null) {
        exportConfig[id] = value;
      } else {
        Object.entries(value).forEach(([key, val]) => {
          exportConfig[id][key] = val;
        });
      }
    }
  }
  // Handle idm files
  if (fs.existsSync(idmPath)) {
    (exportConfig as FullGlobalExportInterface).idm =
      await getIdmImportDataFromIdmDirectory(idmPath);
  }
  // Handle sync files
  if (syncFiles.length) {
    (exportConfig as FullGlobalExportInterface).sync =
      await getLegacyMappingsFromFiles(syncFiles);
  }
  // Handle saml files
  for (const f of samlFiles) {
    let content = JSON.parse(f.content);
    content = content.saml;
    for (const [id, value] of Object.entries(
      content as Record<string, object>
    )) {
      if ((exportConfig as FullRealmExportInterface).saml[id] == null) {
        (exportConfig as FullRealmExportInterface).saml[id] = value;
      } else {
        Object.entries(value).forEach(
          ([key, val]) =>
            ((exportConfig as FullRealmExportInterface).saml[id][key] = val)
        );
      }
    }
  }
  // Handle extracted scripts
  for (const f of scriptFiles) {
    const scriptExport = getScriptExportByScriptFile(f.path);
    Object.entries(scriptExport.script).forEach(([id, script]) => {
      (exportConfig as FullRealmExportInterface).script[id] = script;
    });
  }
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
