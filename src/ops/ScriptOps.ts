import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { type ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';
import {
  type ScriptExportInterface,
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
  const langMap = { JAVASCRIPT: 'JavaSscript', GROOVY: 'Groovy' };
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
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptToFile(
  scriptId: string,
  file: string,
  includeMeta: boolean = true
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
    const scriptExport = await exportScript(scriptId);
    saveJsonToFile(scriptExport, filePath, includeMeta);
    succeedSpinner(`Exported script '${scriptId}' to '${filePath}'.`);
    debugMessage(`Cli.ScriptOps.exportScriptToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting script '${scriptId}'`);
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
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptByNameToFile(
  name: string,
  file: string,
  includeMeta: boolean = true,
  extract: boolean = false
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
    const scriptExport = await exportScriptByName(name);
    if (extract) extractScriptToFile(scriptExport);
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
 * @param {boolean} includeDefault true to include default scripts in export, false otherwise. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptsToFile(
  file: string,
  includeMeta: boolean = true,
  includeDefault: boolean = false
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
    const scriptExport = await exportScripts(includeDefault);
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
 * @param {boolean} includeDefault true to include default scripts in export, false otherwise. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportScriptsToFiles(
  extract: boolean = false,
  includeMeta: boolean = true,
  includeDefault: boolean = false
): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: start`);
  const errors: Error[] = [];
  let barId: string;
  try {
    let scriptList = await readScripts();
    if (!includeDefault)
      scriptList = scriptList.filter((script) => !script.default);
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
        const scriptExport = await exportScriptByName(script.name);
        if (extract) extractScriptToFile(scriptExport);
        saveJsonToFile(scriptExport, file, includeMeta);
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
 * Extracts a script from a script export into a separate file.
 * @param {ScriptExportInterface} scriptExport The script export
 * @param {string} scriptId The script id (optional if there is only one script in the export)
 * @param {string} directory The directory within the base directory to save the script file
 * @returns {boolean} true if successful, false otherwise
 */
export function extractScriptToFile(
  scriptExport: ScriptExportInterface,
  scriptId?: string,
  directory?: string
): boolean {
  try {
    const scriptSkeleton = scriptId
      ? scriptExport.script[scriptId]
      : getScriptSkeleton(scriptExport);
    const fileExtension =
      scriptSkeleton.language === 'JAVASCRIPT' ? 'js' : 'groovy';
    const scriptFileName = getTypedFilename(
      scriptSkeleton.name,
      'script',
      fileExtension
    );
    const scriptFilePath = getFilePath(
      (directory ? `${directory}/` : '') + scriptFileName,
      true
    );
    const scriptText = Array.isArray(scriptSkeleton.script)
      ? scriptSkeleton.script.join('\n')
      : scriptSkeleton.script;
    scriptSkeleton.script = `file://${scriptFilePath}`;
    saveTextToFile(scriptText, scriptFilePath);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

function isScriptExtracted(importData: ScriptExportInterface): boolean {
  debugMessage(`Cli.ScriptOps.isScriptExtracted: start`);
  let extracted = true;
  for (const scriptId of Object.keys(importData.script)) {
    const script = importData.script[scriptId].script;
    if (Array.isArray(script)) {
      debugMessage(`Cli.ScriptOps.isScriptExtracted: script is string array`);
      extracted = false;
      break;
    }
    if (isValidUrl(script as string)) {
      debugMessage(`Cli.ScriptOps.isScriptExtracted: script is extracted`);
      extracted = true;
      break;
    }
    if (isBase64Encoded) {
      debugMessage(`Cli.ScriptOps.isScriptExtracted: script is base64-encoded`);
      extracted = false;
      break;
    }
    break;
  }
  debugMessage(`Cli.ScriptOps.isScriptExtracted: end [extracted=${extracted}]`);
  return extracted;
}

/**
 * Import script(s) from file
 * @param {string} name Optional name of script. If supplied, only the script of that name is imported
 * @param {string} file file name
 * @param {ScriptImportOptions} options Script import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importScriptsFromFile(
  name: string,
  file: string,
  options: ScriptImportOptions = {
    reUuid: false,
    includeDefault: false,
  }
): Promise<boolean> {
  const filePath = getFilePath(file);
  debugMessage(`Cli.ScriptOps.importScriptsFromFile: start`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const importData: ScriptExportInterface = JSON.parse(data);
    if (isScriptExtracted(importData)) {
      await handleScriptFileImport(filePath, options, false);
    } else {
      await importScripts(name, importData, options);
    }
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

  /**
   * Run on file change detection, as well as on initial run.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function onChange(path: string, _stats?: fs.Stats): Promise<void> {
    try {
      await handleScriptFileImport(path, options, validateScripts);
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
        printMessage('Watching for changes...');
      } else {
        watcher.close();
        printMessage('Done.');
      }
    });
}

/**
 * Handle a script file import.
 *
 * @param {string} file Either a script file or an extract file
 * @param {ScriptImportOptions} options Script import options
 * @param {boolean} validateScripts If true, validates Javascript scripts to ensure no errors exist in them. Default: false
 */
async function handleScriptFileImport(
  file: string,
  options: ScriptImportOptions,
  validateScripts: boolean
) {
  debugMessage(`Cli.ScriptOps.handleScriptFileImport: start`);
  const scriptFile = getScriptFile(file);
  const script = getScriptExportByScriptFile(scriptFile);

  const imported = await importScripts('', script, options, validateScripts);
  if (imported) {
    printMessage(`Imported '${scriptFile}'`);
  }
  debugMessage(`Cli.ScriptOps.handleScriptFileImport: end`);
}

/**
 * Get a script file from a file.
 *
 * @param file Either a script file or an extract file
 * @returns The script file
 */
function getScriptFile(file: string): string {
  if (file.endsWith('.script.json')) {
    return file;
  }
  return file.replace(/\.script\.(js|groovy)/, '.script.json');
}

/**
 * Get a script export from a script file.
 *
 * @param scriptFile The path to the script file
 * @returns The script export
 */
function getScriptExportByScriptFile(
  scriptFile: string
): ScriptExportInterface {
  const scriptExport = getScriptExport(scriptFile);
  const scriptSkeleton = getScriptSkeleton(scriptExport);

  const extractFile = getExtractFile(scriptSkeleton);
  if (!extractFile) {
    return scriptExport;
  }

  const scriptRaw = fs.readFileSync(extractFile, 'utf8');
  scriptSkeleton.script = scriptRaw.split('\n');

  return scriptExport;
}

/**
 * Get an extract file from a script skeleton.
 *
 * @param scriptSkeleton The script skeleton
 * @returns The extract file or null if there is no extract file
 */
function getExtractFile(scriptSkeleton: ScriptSkeleton): string | null {
  const extractFile = scriptSkeleton.script;
  if (Array.isArray(extractFile)) {
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
  const scriptExport = JSON.parse(scriptExportRaw) as ScriptExportInterface;

  return scriptExport;
}

/**
 * Get the main script skeleton from a script export. If there is more than one
 * script, an error is thrown.
 *
 * @param script Get the main script skeleton from a script export
 * @returns The main script skeleton
 */
function getScriptSkeleton(script: ScriptExportInterface): ScriptSkeleton {
  const scriptId = getScriptId(script);
  return script.script[scriptId];
}

/**
 * Get the main script ID from a script export. If there is more than one
 * script, an error is thrown.
 *
 * @param script The script export
 * @returns The main script ID
 */
function getScriptId(script: ScriptExportInterface): string {
  const scriptIds = Object.keys(script.script);
  if (scriptIds.length !== 1) {
    throw new Error(`Expected 1 script, found ${scriptIds.length}`);
  }
  return scriptIds[0];
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
  }
  return false;
}
