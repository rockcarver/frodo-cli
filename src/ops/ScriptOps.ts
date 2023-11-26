import { frodo, state } from '@rockcarver/frodo-lib';
import { type ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';
import { type ScriptExportInterface } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import chokidar from 'chokidar';
import fs from 'fs';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  spinSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';
import {
  getTypedFilename,
  isValidUrl,
  saveJsonToFile,
  saveTextToFile,
  titleCase,
} from '../utils/ExportImportUtils';
import wordwrap from './utils/Wordwrap';

const {
  readScripts,
  exportScript,
  exportScriptByName,
  exportScripts,
  importScripts,
} = frodo.script;

const { isBase64Encoded, getFilePath, getWorkingDirectory } = frodo.utils;

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
 * @returns {Promise<boolean>} true if no errors occurred during export, false otherwise
 */
export async function listScripts(long = false): Promise<boolean> {
  let outcome = true;
  debugMessage(`Cli.ScriptOps.listScripts: start`);
  try {
    const scripts = await readScripts();
    scripts.sort((a, b) => a.name.localeCompare(b.name));
    if (long) {
      const table = createTable([
        'Name',
        'UUID',
        'Language',
        'Context',
        'Description',
      ]);
      const langMap = { JAVASCRIPT: 'JS', GROOVY: 'Groovy' };
      scripts.forEach((script) => {
        table.push([
          wordwrap(script.name, 25, '  '),
          script._id,
          langMap[script.language],
          wordwrap(titleCase(script.context.split('_').join(' ')), 25),
          wordwrap(script.description, 30),
        ]);
      });
      printMessage(table.toString(), 'data');
    } else {
      scripts.forEach((script) => {
        printMessage(`${script.name}`, 'data');
      });
    }
  } catch (error) {
    outcome = false;
    printMessage(`Error listing scripts: ${error.message}`, 'error');
    debugMessage(error);
  }
  debugMessage(`Cli.ScriptOps.listScripts: end [${outcome}]`);
  return outcome;
}

/**
 * Export script by id to file
 * @param {string} scriptId script uuid
 * @param {string} file file name
 * @returns {Promise<boolean>} true if no errors occurred during export, false otherwise
 */
export async function exportScriptToFile(
  scriptId: string,
  file: string
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
    saveJsonToFile(scriptExport, filePath);
    succeedSpinner(`Exported script '${scriptId}' to '${filePath}'.`);
    debugMessage(`Cli.ScriptOps.exportScriptToFile: end [true]`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting script '${scriptId}': ${error.message}`);
    debugMessage(error);
  }
  debugMessage(`Cli.ScriptOps.exportScriptToFile: end [false]`);
  return false;
}

/**
 * Export script by name to file
 * @param {string} name script name
 * @param {string} file file name
 * @returns {Promise<boolean>} true if no errors occurred during export, false otherwise
 */
export async function exportScriptByNameToFile(
  name: string,
  file: string
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
    saveJsonToFile(scriptExport, filePath);
    succeedSpinner(`Exported script '${name}' to '${filePath}'.`);
    debugMessage(`Cli.ScriptOps.exportScriptByNameToFile: end [true]`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting script '${name}': ${error.message}`);
    debugMessage(error);
  }
  debugMessage(`Cli.ScriptOps.exportScriptByNameToFile: end [false]`);
  return false;
}

/**
 * Export all scripts to single file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if no errors occurred during export, false otherwise
 */
export async function exportScriptsToFile(file: string): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptsToFile: start`);
  try {
    let fileName = getTypedFilename(
      `all${titleCase(state.getRealm())}Scripts`,
      'script'
    );
    if (file) {
      fileName = file;
    }
    const scriptExport = await exportScripts();
    saveJsonToFile(scriptExport, getFilePath(fileName, true));
    debugMessage(`Cli.ScriptOps.exportScriptsToFile: end [true]`);
    return true;
  } catch (error) {
    printMessage(`Error exporting scripts: ${error.message}`, 'error');
    debugMessage(error);
  }
  debugMessage(`Cli.ScriptOps.exportScriptsToFile: end [false]`);
  return false;
}

/**
 * Export all scripts to individual files
 * @param extract Extracts the scripts from the exports into separate files if true
 * @returns {Promise<boolean>} true if no errors occurred during export, false otherwise
 */
export async function exportScriptsToFiles(extract = false): Promise<boolean> {
  let outcome = true;
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: start`);
  const scriptList = await readScripts();
  const barId = createProgressIndicator(
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
    updateProgressIndicator(barId, `Reading script ${script.name}`);
    const file = getFilePath(getTypedFilename(script.name, 'script'), true);
    try {
      const scriptExport = await exportScriptByName(script.name);
      if (extract) extractScriptToFile(scriptExport);
      saveJsonToFile(scriptExport, file);
      updateProgressIndicator(fileBarId, `Saving ${script.name} to ${file}.`);
      stopProgressIndicator(fileBarId, `${script.name} saved to ${file}.`);
    } catch (error) {
      outcome = false;
      updateProgressIndicator(barId, `Error exporting ${script.name}.`);
      stopProgressIndicator(
        fileBarId,
        `Error saving ${script.name} to ${file}.`
      );
      printMessage(
        `Error exporting script '${script.name}': ${error.message}`,
        'error'
      );
      debugMessage(error);
    }
  }
  stopProgressIndicator(
    barId,
    `Exported ${scriptList.length} scripts to individual files.`
  );
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: end [${outcome}]`);
  return outcome;
}

/**
 * Extracts a script from a script export into a separate file.
 * @param scriptExport The script export
 * @param scriptId The script id (optional if there is only one script in the export)
 * @param directory The directory within the base directory to save the script file
 */
export function extractScriptToFile(
  scriptExport: ScriptExportInterface,
  scriptId?: string,
  directory?: string
) {
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
 * @param {boolean} reUuid true to generate a new uuid for each script on import, false otherwise
 * @returns {Promise<boolean>} true if no errors occurred during import, false otherwise
 */
export async function importScriptsFromFile(
  name: string,
  file: string,
  reUuid = false
): Promise<boolean> {
  let outcome = false;
  const filePath = getFilePath(file);
  debugMessage(`Cli.ScriptOps.importScriptsFromFile: start`);
  fs.readFile(filePath, 'utf8', async (err, data) => {
    try {
      if (err) throw err;
      const importData: ScriptExportInterface = JSON.parse(data);
      if (isScriptExtracted(importData)) {
        await handleScriptFileImport(filePath, reUuid, false);
      } else {
        await importScripts(name, importData, reUuid);
      }
      outcome = true;
    } catch (error) {
      printMessage(
        `Error exporting script '${name}': ${error.message}`,
        'error'
      );
      debugMessage(error);
    }
  });
  debugMessage(`Cli.ScriptOps.importScriptsFromFile: end [${outcome}]`);
  return outcome;
}

/**
 * Import extracted scripts.
 *
 * @param watch whether or not to watch for file changes
 */
export async function importScriptsFromFiles(
  watch: boolean,
  reUuid: boolean,
  validateScripts: boolean
) {
  // If watch is true, it doesn't make sense to reUuid.
  reUuid = watch ? false : reUuid;

  /**
   * Run on file change detection, as well as on initial run.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function onChange(path: string, _stats?: fs.Stats): Promise<void> {
    try {
      await handleScriptFileImport(path, reUuid, validateScripts);
    } catch (error) {
      printMessage(`${path}: ${error.message}`, 'error');
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
      printMessage(`Watcher error: ${error}`, 'error');
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
 * @param file Either a script file or an extract file
 * @param reUuid whether or not to generate a new uuid for each script on import
 */
async function handleScriptFileImport(
  file: string,
  reUuid: boolean,
  validateScripts: boolean
) {
  debugMessage(`Cli.ScriptOps.handleScriptFileImport: start`);
  const scriptFile = getScriptFile(file);
  const script = getScriptExportByScriptFile(scriptFile);

  const imported = await importScripts('', script, reUuid, validateScripts);
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
function getScriptFile(file: string) {
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
