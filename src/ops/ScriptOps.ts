import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { type ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';
import { FullExportInterface } from '@rockcarver/frodo-lib/types/ops/ConfigOps';
import {
  type ScriptExportInterface,
  ScriptExportOptions,
  type ScriptImportOptions,
} from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import chokidar from 'chokidar';
import fs from 'fs';

import {
  extractDataToFile,
  getExtractedData,
  getFullExportConfig,
  getIdLocations,
} from '../utils/Config';
import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  spinSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';
import wordwrap from './utils/Wordwrap';

const {
  getTypedFilename,
  isValidUrl,
  saveJsonToFile,
  titleCase,
  isBase64Encoded,
  getFilePath,
  getWorkingDirectory,
  saveToFile,
  decodeBase64,
} = frodo.utils;
const {
  readScript,
  readScriptByName,
  readScripts,
  exportScript,
  exportScriptByName,
  exportScripts,
  importScripts,
  deleteScript,
  deleteScriptByName,
  deleteScripts,
} = frodo.script;

const langMap = { JAVASCRIPT: 'JavaScript', GROOVY: 'Groovy' };

type SeparatedScripts = {
  realm: Record<string, { script: Record<string, ScriptSkeleton> }>;
};

/**
 * Get a one-line description of the script object
 * @param {ScriptSkeleton} scriptObj script object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(scriptObj: ScriptSkeleton): string {
  const description = `[${scriptObj._id['brightCyan']}] ${scriptObj.context} - ${scriptObj.name}`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Name | Language | Type | Id |\n';
  markdown += '| ---- | -------- | ---- | ---|';
  return markdown;
}

/**
 * Get a one-line description of the script object in markdown
 * @param {TypesRaw.ScriptSkeleton} scriptObj script object to describe
 * @returns {string} markdown table row
 */
export function getTableRowMd(scriptObj: ScriptSkeleton): string {
  const description = `| ${scriptObj.name} | ${
    langMap[scriptObj.language]
  } | ${titleCase(scriptObj.context.split('_').join(' '))} | \`${
    scriptObj._id
  }\` |`;
  return description;
}

/**
 * List scripts
 * @param {boolean} long detail list
 * @param {boolean} usage display usage field
 * @param {String | null} file Optional filename to determine usage
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listScripts(
  long: boolean = false,
  usage: boolean = false,
  file: string | null = null
): Promise<boolean> {
  let spinnerId: string;
  let scripts: ScriptSkeleton[] = [];
  debugMessage(`Cli.ScriptOps.listScripts: start`);
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Reading scripts...`
    );
    scripts = await readScripts();
    scripts.sort((a, b) => a.name.localeCompare(b.name));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${scripts.length} scripts.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error reading scripts`, 'fail');
    printError(error);
    return false;
  }
  if (!long && !usage) {
    scripts.forEach((script) => {
      printMessage(`${script.name}`, 'data');
    });
    debugMessage(`Cli.ScriptOps.listScripts: end`);
    return true;
  }
  let fullExport: FullExportInterface = null;
  let scriptExport: SeparatedScripts = null;
  const headers = long
    ? ['Name', 'UUID', 'Language', 'Context', 'Description']
    : ['Name'];
  if (usage) {
    try {
      fullExport = await getFullExportConfig(file);
    } catch (error) {
      printError(error);
      return false;
    }
    scriptExport = separateScriptsFromFullExport(fullExport);
    headers.push('Used');
  }
  const table = createTable(headers);
  scripts.forEach((script) => {
    const values = long
      ? [
          wordwrap(script.name, 25, '  '),
          script._id,
          langMap[script.language],
          wordwrap(titleCase(script.context.split('_').join(' ')), 25),
          wordwrap(script.description, 30),
        ]
      : [wordwrap(script.name, 25, '  ')];
    if (usage) {
      const locations = getIdLocations(fullExport, script._id, false).concat(
        getScriptLocations(scriptExport, script.name)
      );
      values.push(
        locations.length > 0
          ? `${'yes'['brightGreen']} (${locations.length === 1 ? `at` : `${locations.length} uses, including:`} ${locations[0]})`
          : 'no'['brightRed']
      );
    }
    table.push(values);
  });
  printMessage(table.toString(), 'data');
  debugMessage(`Cli.ScriptOps.listScripts: end`);
  return true;
}

/**
 * Describe a script
 * @param {string} scriptId script id
 * @param {string} scriptName script name
 * @param {string} file optional export file
 * @param {boolean} usage true to describe usage, false otherwise. Default: false
 * @param {boolean} json output description as json. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeScript(
  scriptId: string,
  scriptName: string,
  file?: string,
  usage = false,
  json = false
): Promise<boolean> {
  try {
    let script;
    if (scriptId) {
      script = (await readScript(scriptId)) as ScriptSkeleton & {
        locations: string[];
      };
    } else {
      script = (await readScriptByName(scriptName)) as ScriptSkeleton & {
        locations: string[];
      };
    }
    if (usage) {
      try {
        const fullExport = await getFullExportConfig(file);
        const scriptExport = separateScriptsFromFullExport(fullExport);
        script.locations = getIdLocations(fullExport, script._id, false).concat(
          getScriptLocations(scriptExport, script.name)
        );
      } catch (error) {
        printError(error);
        return false;
      }
    }
    if (json) {
      printMessage(script, 'data');
    } else {
      const table = createKeyValueTable();
      table.push(['Id'['brightCyan'], script._id]);
      table.push(['Name'['brightCyan'], script.name]);
      table.push(['Language'['brightCyan'], langMap[script.language]]);
      table.push([
        'Context'['brightCyan'],
        titleCase(script.context.split('_').join(' ')),
      ]);
      table.push(['Description'['brightCyan'], script.description]);
      table.push([
        'Default'['brightCyan'],
        script.default ? 'true'['brightGreen'] : 'false'['brightRed'],
      ]);
      table.push(['Evaluator Version'['brightCyan'], script.evaluatorVersion]);
      const scriptWrapLength = 80;
      const wrapRegex = new RegExp(`.{1,${scriptWrapLength + 1}}`, 'g');
      const scriptParts = script.script.match(wrapRegex);
      table.push(['Script (Base 64)'['brightCyan'], scriptParts[0]]);
      for (let i = 1; i < scriptParts.length; i++) {
        table.push(['', scriptParts[i]]);
      }
      if (usage) {
        table.push([
          `Usage Locations (${script.locations.length} total)`['brightCyan'],
          script.locations.length > 0 ? script.locations[0] : '',
        ]);
        for (let i = 1; i < script.locations.length; i++) {
          table.push(['', script.locations[i]]);
        }
      }
      printMessage(table.toString(), 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export script by id to file
 * @param {string} scriptId script uuid
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {ScriptExportOptions} options Export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptToFile(
  scriptId: string,
  file: string,
  includeMeta: boolean = true,
  extract: boolean = false,
  options: ScriptExportOptions
): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptToFile: start`);
  try {
    showSpinner(`Exporting script '${scriptId}'...`);
    let fileName = getTypedFilename(scriptId, 'script');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    spinSpinner(`Exporting script '${scriptId}' to '${filePath}'...`);
    const scriptExport = await exportScript(scriptId, options);
    if (extract) {
      extractScriptsToFiles(scriptExport, undefined, undefined, false);
    }
    saveJsonToFile(scriptExport, filePath, includeMeta);
    succeedSpinner(`Exported script '${scriptId}' to '${filePath}'.`);
    debugMessage(`Cli.ScriptOps.exportScriptToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting script '${scriptId}': ${error.message}`);
    printError(error);
  }
  return false;
}

/**
 * Export script by name to file
 * @param {string} name script name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {ScriptExportOptions} options Export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptByNameToFile(
  name: string,
  file: string,
  includeMeta: boolean = true,
  extract: boolean = false,
  options: ScriptExportOptions
): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptByNameToFile: start`);
  try {
    showSpinner(`Exporting script '${name}'...`);
    let fileName = getTypedFilename(name, 'script');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    spinSpinner(`Exporting script '${name}' to '${filePath}'...`);
    const scriptExport = await exportScriptByName(name, options);
    if (extract) extractScriptsToFiles(scriptExport);
    saveJsonToFile(scriptExport, filePath, includeMeta);
    succeedSpinner(`Exported script '${name}' to '${filePath}'.`);
    debugMessage(`Cli.ScriptOps.exportScriptByNameToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting script '${name}': ${error.message}`);
    printError(error);
  }
  return false;
}

/**
 * Export all scripts to single file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ScriptExportOptions} options Export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptsToFile(
  file: string,
  includeMeta: boolean = true,
  options: ScriptExportOptions
): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptsToFile: start`);
  try {
    let fileName = getTypedFilename(
      `all${titleCase(state.getRealm())}Scripts`,
      'script'
    );
    if (file) {
      fileName = file;
    }
    const scriptExport = await exportScripts(options);
    saveJsonToFile(scriptExport, getFilePath(fileName, true), includeMeta);
    debugMessage(`Cli.ScriptOps.exportScriptsToFile: end`);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all scripts to individual files
 * @param {boolean} extract Extracts the scripts from the exports into separate files if true
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {ScriptExportOptions} options Export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptsToFiles(
  extract: boolean = false,
  includeMeta: boolean = true,
  options: ScriptExportOptions
): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: start`);
  const errors: Error[] = [];
  let barId: string;
  try {
    const scriptExport = await exportScripts(options);
    const scriptList = Object.values(scriptExport.script);
    barId = createProgressIndicator(
      'determinate',
      scriptList.length,
      'Exporting scripts to individual files...'
    );
    for (const script of scriptList) {
      const fileBarId = createProgressIndicator(
        'determinate',
        1,
        `Exporting script ${script.name}...`
      );
      const file = getFilePath(getTypedFilename(script.name, 'script'), true);
      try {
        if (extract) {
          extractScriptsToFiles({
            script: {
              [script._id]: script,
            },
          });
        }
        saveToFile('script', script, '_id', file, includeMeta);
        updateProgressIndicator(fileBarId, `Saving ${script.name} to ${file}.`);
        stopProgressIndicator(fileBarId, `${script.name} saved to ${file}.`);
      } catch (error) {
        stopProgressIndicator(
          fileBarId,
          `Error exporting ${script.name}`,
          'fail'
        );
        errors.push(error);
      }
      updateProgressIndicator(barId, `Exported script ${script.name}`);
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting scripts`, errors);
    }
    stopProgressIndicator(
      barId,
      `Exported ${scriptList.length} scripts to individual files.`
    );
    debugMessage(`Cli.ScriptOps.exportScriptsToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(barId, `Error exporting scripts`);
    printError(error);
  }
}

/**
 * Extracts scripts from a script export into separate files.
 * @param {ScriptExportInterface} scriptExport The script export
 * @param {string} scriptId The script id to extract a specific script. If undefined, will extract all scripts.
 * @param {string} directory The directory within the base directory to save the script files
 * @param {boolean} useScriptNamesForFiles True to name files using script names, false to use id's instead. Default: true
 * @returns {boolean} true if successful, false otherwise
 */
export function extractScriptsToFiles(
  scriptExport: ScriptExportInterface,
  scriptId?: string,
  directory?: string,
  useScriptNamesForFiles: boolean = true
): boolean {
  try {
    const scripts = scriptId
      ? [scriptExport.script[scriptId]]
      : Object.values(scriptExport.script);
    for (const script of scripts) {
      const fileExtension = script.language === 'JAVASCRIPT' ? 'js' : 'groovy';
      const scriptFileName = getTypedFilename(
        useScriptNamesForFiles ? script.name : script._id,
        'script',
        fileExtension
      );
      const scriptText = Array.isArray(script.script)
        ? script.script.join('\n')
        : script.script;
      script.script = extractDataToFile(scriptText, scriptFileName, directory);
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

function isScriptExtracted(script: string | string[]): boolean {
  debugMessage(`Cli.ScriptOps.isScriptExtracted: start`);
  let extracted = false;
  if (Array.isArray(script)) {
    debugMessage(`Cli.ScriptOps.isScriptExtracted: script is string array`);
    extracted = false;
  } else if (isValidUrl(script as string)) {
    debugMessage(`Cli.ScriptOps.isScriptExtracted: script is extracted`);
    extracted = script.startsWith('file://');
  } else if (isBase64Encoded(script)) {
    debugMessage(`Cli.ScriptOps.isScriptExtracted: script is base64-encoded`);
    extracted = false;
  }
  debugMessage(`Cli.ScriptOps.isScriptExtracted: end [extracted=${extracted}]`);
  return extracted;
}

/**
 * Import script(s) from file
 * @param {string} id Optional id of script. If supplied, only the script of that id is imported. Takes priority over the name if both are provided.
 * @param {string} name Optional name of script. If supplied, only the script of that name is imported
 * @param {string} file file name
 * @param {ScriptImportOptions} options Script import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importScriptsFromFile(
  id: string = '',
  name: string = '',
  file: string,
  options: ScriptImportOptions = {
    deps: true,
    reUuid: false,
    includeDefault: false,
  }
): Promise<boolean> {
  const filePath = getFilePath(file);
  debugMessage(`Cli.ScriptOps.importScriptsFromFile: start`);
  try {
    await handleScriptFileImport(id, name, filePath, options, false);
    debugMessage(`Cli.ScriptOps.importScriptsFromFile: end`);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Import extracted scripts.
 *
 * @param {boolean} watch whether or not to watch for file changes
 * @param {ScriptImportOptions} options Script import options
 * @param {boolean} validateScripts If true, validates Javascript scripts to ensure no errors exist in them. Default: false
 */
export async function importScriptsFromFiles(
  watch: boolean,
  options: ScriptImportOptions,
  validateScripts: boolean
): Promise<void> {
  debugMessage(`Cli.ScriptOps.importScriptsFromFiles: start`);

  // If watch is true, it doesn't make sense to reUuid.
  options.reUuid = watch ? false : options.reUuid;

  let initialImport = true;
  // Generate mappings while importing to identify script files with their script ids and json files for use in watching.
  const scriptPathToJsonMapping = {};
  const scriptPathToIdMapping = {};

  /**
   * Run on file change detection, as well as on initial run.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function onChange(path: string, _stats?: fs.Stats): Promise<void> {
    debugMessage(
      `Cli.ScriptOps.importScriptsFromFiles.onChange: start [initialImport=${initialImport}, path=${path}]`
    );
    try {
      if (initialImport && path.endsWith('.script.json')) {
        debugMessage(
          `Cli.ScriptOps.importScriptsFromFiles.onChange: initial import of ${path}`
        );
        if (watch) {
          scriptPathToJsonMapping[path] = path;
          for (const extracted of getExtractedPathsAndNames(path)) {
            scriptPathToJsonMapping[extracted.path] = path;
            scriptPathToIdMapping[extracted.path] = extracted.id;
          }
        } else {
          await handleScriptFileImport('', '', path, options, validateScripts);
        }
      } else if (!initialImport) {
        await handleScriptFileImport(
          scriptPathToIdMapping[path],
          '',
          scriptPathToJsonMapping[path],
          options,
          validateScripts
        );
      }
    } catch (error) {
      printError(error, `${path}`);
    }
    debugMessage(`Cli.ScriptOps.importScriptsFromFiles.onChange: end`);
  }

  // We watch json files and script files.
  const watcher = chokidar.watch(getWorkingDirectory(), {
    // ignored: (path, stats) =>
    //   watch
    //     ? // in watch mode, ignore everything but raw scripts
    //       stats?.isFile() &&
    //       !path?.endsWith('.script.js') &&
    //       !path?.endsWith('.script.groovy')
    //     : // in regular mode, ignore everything but frodo script exports
    //       stats?.isFile() && !path?.endsWith('.script.json'),
    ignored: (path, stats) =>
      stats?.isFile() &&
      !path?.endsWith('.script.json') &&
      !path?.endsWith('.script.js') &&
      !path?.endsWith('.script.groovy'),
    persistent: watch,
    ignoreInitial: false,
  });

  watcher
    .on('add', onChange)
    .on('change', onChange)
    .on('error', (error) => {
      printError(error as Error, `Watcher error`);
      watcher.close();
    })
    .on('ready', async () => {
      debugMessage(
        `Cli.ScriptOps.importScriptsFromFiles: Watcher ready: ${JSON.stringify(watcher.getWatched())}`
      );
      if (watch) {
        initialImport = false;
        printMessage('Watching for changes...');
      } else {
        await watcher.close();
      }
    });

  debugMessage(`Cli.ScriptOps.importScriptsFromFiles: end`);
}

/**
 * Handle a script file import.
 * @param {string} id Optional id of script. If supplied, only the script of that id is imported. Takes priority over the name if both are provided.
 * @param {string} name Optional name of script. If supplied, only the script of that name is imported
 * @param {string} file The script json file
 * @param {ScriptImportOptions} options Script import options
 * @param {boolean} validateScripts If true, validates Javascript scripts to ensure no errors exist in them. Default: false
 */
async function handleScriptFileImport(
  id: string = '',
  name: string = '',
  file: string,
  options: ScriptImportOptions,
  validateScripts: boolean
) {
  debugMessage(`Cli.ScriptOps.handleScriptFileImport: start`);
  const script = getScriptExportByScriptFile(file);
  const indicatorId = createProgressIndicator('determinate', 1, `${file}`);
  try {
    await importScripts(id, name, script, options, validateScripts);
    updateProgressIndicator(indicatorId, `${file}`);
    stopProgressIndicator(indicatorId, `${file}`);
  } catch (error) {
    stopProgressIndicator(indicatorId, `${file}: ${error}`);
  }
  debugMessage(`Cli.ScriptOps.handleScriptFileImport: end`);
}

/**
 * Get a script export from a script file.
 *
 * @param scriptFile The path to the script file
 * @returns The script export
 */
export function getScriptExportByScriptFile(
  scriptFile: string
): ScriptExportInterface {
  const scriptExport = getScriptExport(scriptFile);
  for (const script of Object.values(scriptExport.script)) {
    if (!isScriptExtracted(script.script)) {
      continue;
    }
    const scriptRaw = getExtractedData(
      script.script as string,
      scriptFile.substring(0, scriptFile.lastIndexOf('/'))
    );
    script.script = scriptRaw.split('\n');
  }
  return scriptExport;
}

/**
 * Get a script export from a file.
 *
 * @param file The path to a script export file
 * @returns The script export
 */
function getScriptExport(file: string): ScriptExportInterface {
  const scriptExportRaw = fs.readFileSync(file, 'utf8');
  return JSON.parse(scriptExportRaw) as ScriptExportInterface;
}

/**
 * Gets extracted file paths and script ids from json file
 *
 * @param file the json file
 * @returns The extracted file paths and script ids
 */
function getExtractedPathsAndNames(
  file: string
): { path: string; id: string }[] {
  const extractedFileNames = [];
  const scriptExport = getScriptExport(file);
  const directory =
    file.lastIndexOf('/') === -1
      ? ''
      : file.substring(0, file.lastIndexOf('/')) + '/';
  for (const script of Object.values(scriptExport.script)) {
    if (!isScriptExtracted(script.script)) {
      continue;
    }
    extractedFileNames.push({
      path: `${directory}${(script.script as string).replace('file://', '')}`,
      id: script._id,
    });
  }
  return extractedFileNames;
}

/**
 * Delete script by id
 * @param {String} id script id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteScriptId(id: string): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${id}...`
  );
  try {
    await deleteScript(id);
    stopProgressIndicator(spinnerId, `Deleted ${id}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete script by name
 * @param {String} name script name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteScriptName(name: string): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${name}...`
  );
  try {
    await deleteScriptByName(name);
    stopProgressIndicator(spinnerId, `Deleted ${name}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete all non-default scripts
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAllScripts(): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting all non-default scripts...`
  );
  try {
    await deleteScripts();
    stopProgressIndicator(
      spinnerId,
      `Deleted all non-default scripts.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Helper that takes a full export and separates the scripts from it into their own export
 * @param {FullExportInterface} fullExport The full export
 * @returns {SeparatedScripts} The scripts separated from the fullExport
 */
function separateScriptsFromFullExport(
  fullExport: FullExportInterface
): SeparatedScripts {
  const scripts = { realm: {} };
  for (const [realm, realmExport] of Object.entries(fullExport.realm)) {
    if (!scripts.realm[realm]) {
      scripts.realm[realm] = {};
    }
    scripts.realm[realm].script = realmExport.script;
    delete realmExport.script;
  }
  return scripts;
}

/**
 * Helper that finds all locations where a script is being used as a library in another script
 * @param {SeparatedScripts} configuration The scripts to search
 * @param {string} scriptName The name of the script being searched for
 */
function getScriptLocations(
  configuration: SeparatedScripts,
  scriptName: string
): string[] {
  const locations = [];
  const regex = new RegExp(`require\\(['|"]${scriptName}['|"]\\)`);
  for (const [realm, realmExport] of Object.entries(configuration.realm)) {
    for (const scriptData of Object.values(realmExport.script)) {
      let scriptString = scriptData.script as string;
      if (Array.isArray(scriptData.script)) {
        scriptString = scriptData.script.join('\n');
      } else if (isBase64Encoded(scriptData.script)) {
        scriptString = decodeBase64(scriptData.script);
      }
      if (regex.test(scriptString)) {
        locations.push(
          `realm.${realm}.script.${scriptData._id}(name: '${scriptData.name}').script`
        );
      }
    }
  }
  return locations;
}
