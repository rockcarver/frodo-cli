import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { fileFilter, realmList, safeFileName } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const {
  getFilePath,
  saveJsonToFile,
  decodeBase64,
  saveTextToFile,
  readJsonFile,
  getWorkingDirectory,
} = frodo.utils;
const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { readScripts, readScriptByName, updateScript, deleteScript } =
  frodo.script;

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

        const importedScript = await updateScript(importData._id, importData);
        if (!importedScript)
          printMessage(
            `No change in script ${importData.name} - skipping update`
          );
      }
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

/**
 * Delete scripts using config-manager selection rules. Default scripts are
 * never deleted: AM refuses to delete them, and the library's own delete-all
 * leaves them alone too.
 * @param {string[]} prefixes Optional name prefixes. Ignored when name is provided.
 * @param {string} realm Optional realm to process. If omitted, uses the configured realm list.
 * @param {string} name Optional exact name of a script to delete.
 * @param {boolean} dryRun Preview matching scripts without deleting them. For unnamed previews, show counts by context.
 * @param {boolean} allowFailures True to succeed although some scripts could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} True if the operation succeeds, otherwise false. A script that cannot be deleted does not stop the others; the result is false if any failed, unless failures are allowed. A realm whose scripts cannot be read ends the run.
 */
export async function configManagerDeleteScripts(
  prefixes: string[] = [],
  realm?: string,
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'script', allowFailures });
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    if (name && realms.length !== 1) {
      printMessage('For a script name, specify a single realm.', 'error');
      return false;
    }
    const scriptCountsByContext = new Map<string, number>();
    let eligible = 0;
    for (const currentRealm of realms) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      state.setRealm(currentRealm);
      const scripts = await readScripts();
      const matching = scripts.filter((script) =>
        name
          ? script.name === name
          : script.language === 'JAVASCRIPT' &&
            (prefixes.length === 0 ||
              prefixes.some((prefix) => script.name.startsWith(prefix)))
      );
      if (name && matching.length !== 1) {
        printMessage(
          matching.length === 0
            ? `No script found with name: ${name}`
            : `Multiple scripts found with name: ${name}`,
          'error'
        );
        return false;
      }
      if (name && matching[0].default) {
        printMessage(
          `Script ${name} is a default script and cannot be deleted.`,
          'error'
        );
        return false;
      }
      const eligibleScripts = matching
        .filter((script) => !script.default)
        .sort((a, b) => a.context.localeCompare(b.context));
      eligible += eligibleScripts.length;
      for (const script of eligibleScripts) {
        const label = `${script.name} (${script._id}) in realm ${currentRealm}`;
        if (dryRun) {
          printMessage(`Dry run: Deleting script ${label}`);
          const count = scriptCountsByContext.get(script.context) ?? 0;
          scriptCountsByContext.set(script.context, count + 1);
          continue;
        }
        try {
          await deleteScript(script._id);
          printMessage(`Successfully deleted script ${label}`);
          run.recordSuccess();
        } catch (error) {
          printError(error, `Failed to delete script ${label}`);
          run.recordFailure(
            `${script.name} in realm ${currentRealm}`,
            causeOf(error)
          );
        }
      }
    }
    if (eligible === 0) {
      printMessage('No scripts found to delete.');
    } else if (dryRun && !name) {
      let summary = '--- Scripts Deletion Summary by Type ---';
      for (const [context, count] of scriptCountsByContext) {
        summary += `\n- ${context}: ${count}`;
      }
      printMessage(summary);
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting scripts.');
    // what failed before the read that failed is still summarised
    run.finish();
    return false;
  }
}
