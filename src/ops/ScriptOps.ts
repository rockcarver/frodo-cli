import fs from 'fs';
import { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { Script, ExportImportUtils, state } from '@rockcarver/frodo-lib';
import {
  createProgressBar,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  spinSpinner,
  stopProgressBar,
  succeedSpinner,
  updateProgressBar,
} from '../utils/Console';
import wordwrap from './utils/Wordwrap';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';

const {
  getScripts,
  exportScripts,
  exportScript,
  exportScriptByName,
  importScripts,
} = Script;

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
 * @param {ScriptSkeleton} scriptObj script object to describe
 * @returns {string} markdown table row
 */
export function getTableRowMd(scriptObj: ScriptSkeleton): string {
  const langMap = { JAVASCRIPT: 'JavaSscript', GROOVY: 'Groovy' };
  const description = `| ${scriptObj.name} | ${
    langMap[scriptObj.language]
  } | ${ExportImportUtils.titleCase(
    scriptObj.context.split('_').join(' ')
  )} | \`${scriptObj._id}\` |`;
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
    const scripts = await getScripts();
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
    spinSpinner(`Exporting script '${scriptId}' to '${fileName}'...`);
    const exportData = await exportScript(scriptId);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported script '${scriptId}' to '${fileName}'.`);
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
    spinSpinner(`Exporting script '${name}' to '${fileName}'...`);
    const exportData = await exportScriptByName(name);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported script '${name}' to '${fileName}'.`);
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
    const exportData = await exportScripts();
    saveJsonToFile(exportData, fileName);
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
 * @returns {Promise<boolean>} true if no errors occurred during export, false otherwise
 */
export async function exportScriptsToFiles(): Promise<boolean> {
  let outcome = true;
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: start`);
  const scriptList = await getScripts();
  createProgressBar(
    scriptList.length,
    'Exporting scripts to individual files...'
  );
  for (const script of scriptList) {
    try {
      updateProgressBar(`Reading script ${script.name}`);
      const fileName = getTypedFilename(script.name, 'script');
      const exportData = await exportScriptByName(script.name);
      saveJsonToFile(exportData, fileName);
    } catch (error) {
      outcome = false;
      printMessage(
        `Error exporting script '${script.name}': ${error.message}`,
        'error'
      );
      debugMessage(error);
    }
  }
  stopProgressBar(`Exported ${scriptList.length} scripts to individual files.`);
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: end [${outcome}]`);
  return outcome;
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
  debugMessage(`Cli.ScriptOps.importScriptsFromFile: start`);
  fs.readFile(file, 'utf8', async (err, data) => {
    try {
      if (err) throw err;
      const importData = JSON.parse(data);
      outcome = await importScripts(name, importData, reUuid);
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
