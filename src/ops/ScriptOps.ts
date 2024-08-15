import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { type ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';
import {
  type ScriptExportInterface,
  ScriptExportOptions,
  type ScriptImportOptions,
} from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import chokidar from 'chokidar';
import fs from 'fs';

import { getFullExportConfig, isIdUsed } from '../utils/Config';
import {
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
  saveTextToFile,
  titleCase,
  isBase64Encoded,
  getFilePath,
  getWorkingDirectory,
  saveToFile,
} = frodo.utils;
const {
  readScripts,
  exportScript,
  exportScriptByName,
  exportScripts,
  importScripts,
  deleteScript,
  deleteScriptByName,
  deleteScripts,
} = frodo.script;

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
  const langMap = { JAVASCRIPT: 'JavaScript', GROOVY: 'Groovy' };
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
  let fullExport = null;
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
    //Delete scripts from full export so they aren't mistakenly used for determining usage
    delete fullExport.script;
    headers.push('Used');
  }
  const table = createTable(headers);
  const langMap = { JAVASCRIPT: 'JS', GROOVY: 'Groovy' };
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
      const isScriptUsed = isIdUsed(fullExport, script._id, false);
      values.push(
        isScriptUsed.used
          ? `${'yes'['brightGreen']} (at ${isScriptUsed.location})`
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
      const scriptFilePath = getFilePath(
        (directory ? `${directory}/` : '') + scriptFileName,
        true
      );
      const scriptText = Array.isArray(script.script)
        ? script.script.join('\n')
        : script.script;
      script.script = `file://${scriptFileName}`;
      saveTextToFile(scriptText, scriptFilePath);
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
    extracted = true;
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
  // If watch is true, it doesn't make sense to reUuid.
  options.reUuid = watch ? false : options.reUuid;

  // When doing initial import, only focus on .json files.
  let initialImport = true;
  // Generate mappings while importing to identify script files with their script ids and json files for use in watching.
  const scriptPathToJsonMapping = {};
  const scriptPathToIdMapping = {};

  /**
   * Run on file change detection, as well as on initial run.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function onChange(path: string, _stats?: fs.Stats): Promise<void> {
    try {
      if (initialImport && path.endsWith('.script.json')) {
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
  }

  // We watch json files and script files.
  const watcher = chokidar.watch(
    [
      `${getWorkingDirectory()}/**/*.script.json`,
      `${getWorkingDirectory()}/**/*.script.js`,
      `${getWorkingDirectory()}/**/*.script.groovy`,
    ],
    {
      persistent: watch,
      ignoreInitial: false,
    }
  );

  watcher
    .on('add', onChange)
    .on('change', onChange)
    .on('error', (error) => {
      printError(error, `Watcher error`);
      watcher.close();
    })
    .on('ready', () => {
      if (watch) {
        initialImport = false;
        printMessage('Watching for changes...');
      } else {
        watcher.close();
        printMessage('Done.');
      }
    });
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
  const imported = await importScripts(
    id,
    name,
    script,
    options,
    validateScripts
  );
  if (imported) {
    printMessage(`Imported '${file}'`);
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
    const extractFile = getExtractFile(script);
    if (!extractFile) {
      continue;
    }
    const directory =
      scriptFile.substring(0, scriptFile.lastIndexOf('/')) || '.';
    const scriptRaw = fs.readFileSync(`${directory}/${extractFile}`, 'utf8');
    script.script = scriptRaw.split('\n');
  }
  return scriptExport;
}

/**
 * Get an extract file from a script skeleton.
 *
 * @param scriptSkeleton The script skeleton
 * @returns The extract file or null if there is no extract file
 */
function getExtractFile(scriptSkeleton: ScriptSkeleton): string | null {
  const extractFile = scriptSkeleton.script as string;
  if (!isScriptExtracted(extractFile)) {
    return null;
  }
  if (
    extractFile.startsWith('file://') &&
    (extractFile.endsWith('.js') || extractFile.endsWith('.groovy'))
  ) {
    return extractFile.replace('file://', '');
  }
  return null;
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
  const directory = file.substring(0, file.lastIndexOf('/')) || '.';
  for (const script of Object.values(scriptExport.script)) {
    const extractFile = getExtractFile(script);
    if (!extractFile) {
      continue;
    }
    extractedFileNames.push({
      path: `${directory}/${extractFile}`,
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
