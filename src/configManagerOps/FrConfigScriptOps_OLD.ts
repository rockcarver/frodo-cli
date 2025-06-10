import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { ScriptSkeleton } from '@rockcarver/frodo-lib/types/api/ScriptApi';
import { ScriptExportOptions } from '@rockcarver/frodo-lib/types/ops/ScriptOps';
import fs from 'fs';

import {
  createProgressIndicator,
  debugMessage,
  printError,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const { exportScripts } = frodo.script;
const { getFilePath, getTypedFilename, saveJsonToFile, getCurrentRealmName } =
  frodo.utils;

function saveScriptToFile(script: ScriptSkeleton, exportDir: string) {
  const scriptContentRelativePath = `scripts-content/${script.context}`;
  const scriptContentPath = `${exportDir}/${scriptContentRelativePath}`;
  if (!fs.existsSync(scriptContentPath)) {
    fs.mkdirSync(scriptContentPath, { recursive: true });
  }

  const scriptConfigPath = `${exportDir}/scripts-config`;
  if (!fs.existsSync(scriptConfigPath)) {
    fs.mkdirSync(scriptConfigPath, { recursive: true });
  }

  const scriptFilename = `${script.name}.js`;
  let scriptToOutput = script.script;
  if (Array.isArray(scriptToOutput)) {
    scriptToOutput = scriptToOutput.join('\n');
  }
  // const buff = Buffer.from(scriptToOutput, "base64");
  // const source = buff.toString("utf-8");
  fs.writeFileSync(`${scriptContentPath}/${scriptFilename}`, scriptToOutput);
  script.script = {
    // @ts-expect-error We export this format but its not in the type
    file: `${scriptContentRelativePath}/${scriptFilename}`,
  };

  const scriptFileName = `${scriptConfigPath}/${script._id}.json`;
  saveJsonToFile(script, scriptFileName);
}

function processScripts(
  scripts: ScriptSkeleton[],
  exportDir: string,
  name: string
) {
  try {
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    let scriptNotFound = true;

    for (const script of scripts) {
      if (script.language !== 'JAVASCRIPT') {
        continue;
      }

      if (name && name !== script.name) {
        continue;
      }

      scriptNotFound = false;

      saveScriptToFile(script, exportDir);
    }

    if (name && scriptNotFound) {
      console.warn('Script not found (check SCRIPT_PREFIXES)');
    }
  } catch (err) {
    console.error(err);
  }
}

/**
 * Export all scripts to individual files in fr-config-manager format
 * @param {ScriptExportOptions} options Export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportScripts(
  options: ScriptExportOptions
): Promise<boolean> {
  debugMessage(`Cli.ScriptOps.exportScriptsToFiles: start`);
  const errors: Error[] = [];
  let barId: string;
  try {
    const fullExportOptions: ScriptExportOptions = {
      ...options,
      includeDefault: true,
    };
    const scriptExport = await exportScripts(fullExportOptions);
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
        const fileDir = `realms/${getCurrentRealmName()}/scripts`;
        processScripts([script], fileDir, script.name);
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
