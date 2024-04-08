import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { FullExportInterface } from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import fs from 'fs';
import os from 'os';
import slugify from 'slugify';

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
 * 3. The cloud tenant if the exports are not locally provided
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
    });
  }
  // Go through files in the working directory and reconstruct the full export
  return getFullExportConfigFromDirectory(workingDirectory);
}

/**
 * Reconstructs the full export config from files in the given directory
 * @param directory The directory
 * @return The full export config
 */
export async function getFullExportConfigFromDirectory(
  directory: string
): Promise<FullExportInterface> {
  const fullExportConfig = {
    meta: {},
    agents: {},
    application: {},
    authentication: {},
    config: {},
    emailTemplate: {},
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
    secrets: {},
    service: {},
    theme: {},
    trees: {},
    variables: {},
  } as FullExportInterface;
  const files = await readFiles(directory);
  const jsonFiles = files.filter((f) => f.path.endsWith('.json'));
  const idmConfigFiles = jsonFiles.filter((f) => f.path.startsWith('config/'));
  const samlFiles = jsonFiles.filter(
    (f) => f.path.startsWith('saml/') || f.path.startsWith('cot/')
  );
  const otherFiles = jsonFiles.filter(
    (f) =>
      !f.path.startsWith('config/') &&
      !f.path.startsWith('saml/') &&
      !f.path.startsWith('cot/')
  );
  const scriptFiles = files.filter(
    (f) => f.path.endsWith('.js') || f.path.endsWith('.groovy')
  );
  // Handle json files
  for (const f of otherFiles) {
    for (const [id, value] of Object.entries(JSON.parse(f.content))) {
      if (value == null || fullExportConfig[id] == null) {
        continue;
      }
      Object.assign(fullExportConfig[id], value);
    }
  }
  // Handle saml files
  for (const f of samlFiles) {
    let content = JSON.parse(f.content);
    content = content.saml;
    for (const [id, value] of Object.entries(content)) {
      Object.assign(fullExportConfig.saml[id], value);
    }
  }
  // Handle idm config files
  for (const f of idmConfigFiles) {
    const content = JSON.parse(f.content);
    fullExportConfig.config[content._id] = content;
  }
  // Handle extracted scripts, adding them to their corresponding script objects in the export
  if (scriptFiles.length > 0 && fullExportConfig.script != null) {
    const scriptExports = Object.values(fullExportConfig.script);
    for (const f of scriptFiles) {
      const name = f.path.substring(
        f.path.lastIndexOf('/') + 1,
        f.path.indexOf('.', f.path.lastIndexOf('/'))
      );
      const scriptLines = f.content.split('\n');
      const script = scriptExports.find(
        (s) =>
          slugify(s.name.replace(/^http(s?):\/\//, ''), {
            remove: /[^\w\s$*_+~.()'"!\-@]+/g,
          }) === name
      );
      if (!script) {
        throw new FrodoError(
          `Can't find the script corresponding to the file '${f.path}' in the export files`
        );
      }
      script.script = scriptLines;
    }
  }
  return fullExportConfig;
}

/**
 * Determines if a string id is being used anywhere within the given configuration object
 * @param configuration The configuration object
 * @param id The id being search for
 * @param isEsv Whether the id corresponds to an ESV or not
 */
export function isIdUsed(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configuration: any,
  id: string,
  isEsv: boolean
): {
  used: boolean;
  location: string;
} {
  return isIdUsedRecurse(
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
 * Recursive helper for isIdUsed that finds any strings contained in the configuration that pass the regex
 * @param configuration The configuration (could be anything)
 * @param regex The regex test
 */
function isIdUsedRecurse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  configuration: any,
  regex: RegExp
): {
  used: boolean;
  location: string;
} {
  const type = typeof configuration;
  if (type === 'object' && configuration !== null) {
    for (const [id, value] of Object.entries(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configuration as Record<string, any>
    )) {
      const isIdUsed = isIdUsedRecurse(value, regex);
      if (isIdUsed.used) {
        isIdUsed.location =
          id +
          (value.name ? `(name: '${value.name}')` : '') +
          (isIdUsed.location === '' ? '' : '.') +
          isIdUsed.location;
        return isIdUsed;
      }
    }
  }
  return {
    used: type === 'string' && regex.test(configuration),
    location: '',
  };
}
