import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';

import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { fileFilter, realmList, safeFileName } from '../utils/FrConfig';

const {
  getFilePath,
  saveJsonToFile,
  decodeBase64,
  saveTextToFile,
  readJsonFile,
  getWorkingDirectory,
} = frodo.utils;
const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { readScripts, readScriptByName, importScripts } = frodo.script;

/**
 * Export scripts in config-manager format
 * @param {string} prefixes optional prefixes array; if not empty, will look only for scripts that start with the prefixes
 * @param {string} realm Designates the specific realm to pull from
 * @param {string} name only exports specifically named script
 * @returns {boolean} True if export was successful
 */
export async function configManagerExportScripts(
  prefixes: string[] = [],
  realm?: string,
  name?: string
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Exporting scripts...'
  );
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    if (name && realms.length !== 1) {
      stopProgressIndicator(
        indicatorId,
        'Error: for a named script, specify a single realm',
        'fail'
      );
      return false;
    }
    for (const realm of realms) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      const scripts = name
        ? [await readScriptByName(name)]
        : await readScripts();
      for (const s of scripts) {
        if (
          !name &&
          prefixes.length &&
          !prefixes.some((p) => s.name.startsWith(p))
        )
          continue;
        if (s.language !== 'JAVASCRIPT') continue;

        const decodedScript = decodeBase64(
          Array.isArray(s.script) ? s.script.join('\n') : s.script
        );
        const scriptName = safeFileName(s.name);
        const relScriptPath = `scripts-content/${s.context}/${scriptName}.js`;
        const fileObj = { file: relScriptPath };
        const realmDir = realm === '/' ? 'root' : realm;
        saveJsonToFile(
          { ...s, script: fileObj },
          getFilePath(
            `realms/${realmDir}/scripts/scripts-config/${s._id}.json`,
            true
          ),
          false,
          false,
          true
        );
        saveTextToFile(
          decodedScript,
          getFilePath(`realms/${realmDir}/scripts/${relScriptPath}`, true)
        );
      }
    }
    stopProgressIndicator(
      indicatorId,
      'Finished exporting scripts.',
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Error exporting scripts.', 'fail');
    printError(error, 'Error exporting scripts.');
    return false;
  }
}

/**
 * Import scripts in fr-config-manager format
 * @param {string} realm option to determine which realm to import
 * @param {string} name option to import a specific script by name
 * @param {string} filenameFilter option to filter imported scripts
 * @returns True if Import was successful
 */
export async function configManagerImportScripts(
  realm?: string,
  name?: string,
  filenameFilter?: string
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing scripts...'
  );

  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    const realms: string[] =
      realm && realm !== DEFAULT_REALM_KEY
        ? [realm === '/' ? 'root' : realm]
        : fs
            .readdirSync(realmsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);

    if (name && realms.length !== 1) {
      stopProgressIndicator(
        indicatorId,
        'For a named script, specify a single realm',
        'fail'
      );
      return false;
    }

    let scriptNotFound = !!name;

    for (const realm of realms) {
      const realmName = realm === 'root' ? '/' : realm;

      if (
        realmName === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;

      state.setRealm(realmName);

      const configDir = `${getWorkingDirectory()}/realms/${realm}/scripts/scripts-config`;
      if (!fs.existsSync(configDir)) {
        printMessage(
          `Warning: no script config defined in realm ${realm}. Expecting directory ${configDir}`,
          'warn'
        );
        continue;
      }
      const configFiles = fs
        .readdirSync(configDir)
        .filter((file) => file.endsWith('.json'));
      const scripts = { script: {} };

      for (const file of configFiles) {
        const configPath = `${configDir}/${file}`;
        const importData = readJsonFile(configPath) as any;

        if (!fileFilter(importData.script.file, filenameFilter)) {
          continue;
        }

        if (!importData.name || importData.name.trim() === '') {
          stopProgressIndicator(
            indicatorId,
            `Script ${importData._id} must have a valid (non-blank) name!`,
            'fail'
          );
          return false;
        }

        if (name && importData.name !== name) continue;
        scriptNotFound = false;

        const fullScriptPath = getFilePath(
          `realms/${realm}/scripts/${importData.script.file}`
        );
        delete importData.script.file;
        importData.script = fs.readFileSync(fullScriptPath, 'utf8');
        scripts.script[importData._id] = importData;
      }

      if (Object.keys(scripts.script).length === 0) {
        continue;
      }
      await importScripts(null, null, scripts);
    }

    if (name && scriptNotFound) {
      printMessage(`Script "${name}" not found`, 'warn');
    }

    stopProgressIndicator(
      indicatorId,
      'Finished importing scripts.',
      'success'
    );

    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Error importing scripts', 'fail');
    printError(error, 'Error importing scripts.');
    return false;
  }
}
