import fs from 'fs';
import { frodo, state, type ScriptSkeleton } from '@rockcarver/frodo-lib';
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
 * Write one script in config-manager format: the configuration as
 * `realms/<realm>/scripts/scripts-config/<id>.json` and the text of the script
 * as `realms/<realm>/scripts/scripts-content/<context>/<name>.js`. Shared by
 * `pull scripts` and by the commands that pull a script because something else
 * (an application) uses it.
 * @param {ScriptSkeleton} script the script, as the library reads it
 * @param {string} realm the realm the script belongs to (`/` is written as `root`)
 * @throws {FrodoError} if a file cannot be written
 */
export function exportScriptToFiles(script: ScriptSkeleton, realm: string) {
  const decodedScript = decodeBase64(
    Array.isArray(script.script) ? script.script.join('\n') : script.script
  );
  const scriptName = safeFileName(script.name);
  const relScriptPath = `scripts-content/${script.context}/${scriptName}.js`;
  const fileObj = { file: relScriptPath };
  const realmDir = realm === '/' ? 'root' : realm;
  saveJsonToFile(
    { ...script, script: fileObj },
    getFilePath(
      `realms/${realmDir}/scripts/scripts-config/${script._id}.json`,
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

/**
 * Export scripts in config-manager format
 * @param {string} prefixes optional prefixes array; if not empty, will look only for scripts that start with the prefixes
 * @param {string} realm Designates the specific realm to pull from
 * @param {string} name only exports specifically named script
 * @param {boolean} allowFailures True to succeed although some scripts could not be exported (the failures are still summarised)
 * @returns {boolean} True if export was successful. A script or a realm that cannot be exported does not stop the others; the result is false if any failed, unless failures are allowed. A named script that cannot be read, or that is not a JavaScript script, fails the command whatever the option says.
 */
export async function configManagerExportScripts(
  prefixes: string[] = [],
  realm?: string,
  name?: string,
  allowFailures: boolean = false
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
    const run = new OperationRun({ unit: 'script', allowFailures });
    let cannotExportNamed = false;
    for (const currentRealm of realms) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(currentRealm);
      let scripts: ScriptSkeleton[];
      try {
        scripts = name ? [await readScriptByName(name)] : await readScripts();
      } catch (error) {
        if (name) {
          // the one script that was asked for: nothing for the flag to allow
          printError(
            error,
            `Error reading script '${name}' in realm '${currentRealm}'`
          );
          cannotExportNamed = true;
        } else {
          printError(
            error,
            `Error reading the scripts of realm '${currentRealm}'`
          );
          run.recordFailure(`realm ${currentRealm}`, causeOf(error));
        }
        continue;
      }
      for (const s of scripts) {
        if (
          !name &&
          prefixes.length &&
          !prefixes.some((p) => s.name.startsWith(p))
        )
          continue;
        if (s.language !== 'JAVASCRIPT') {
          if (name) {
            printMessage(
              `Script '${name}' is not a JavaScript script and cannot be exported.`,
              'error'
            );
            cannotExportNamed = true;
          }
          continue;
        }

        try {
          exportScriptToFiles(s, currentRealm);
          run.recordSuccess();
        } catch (error) {
          printError(
            error,
            `Error exporting script '${s.name}' of realm '${currentRealm}'`
          );
          run.recordFailure(
            `${s.name} in realm ${currentRealm}`,
            causeOf(error)
          );
        }
      }
    }
    const failed = run.hasFailures || cannotExportNamed;
    stopProgressIndicator(
      indicatorId,
      failed
        ? 'Finished exporting scripts with errors.'
        : 'Finished exporting scripts.',
      failed ? 'fail' : 'success'
    );
    // the named script, when it cannot be read or is of another language, is
    // not an operation that failed among others: it fails the command whatever
    // --allow-failures says
    return run.finish() && !cannotExportNamed;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Error exporting scripts.', 'fail');
    printError(error, 'Error exporting scripts.');
    return false;
  }
}

/**
 * Import one script from the files of config-manager format:
 * `realms/<realm>/scripts/scripts-config/<id>.json` and the text it refers to.
 * Shared by the commands that push a script because something else (an
 * application) uses it.
 * @param {string} scriptId the id of the script (the name of its configuration file)
 * @param {string} realm the realm of the script (`/` is read from `root`); it must be the current realm of the state
 * @throws {FrodoError} if the files cannot be read, the name of the script is blank or the script cannot be updated
 */
export async function importScriptFromFiles(
  scriptId: string,
  realm: string
): Promise<void> {
  const realmDir = realm === '/' ? 'root' : realm;
  const importData = readJsonFile(
    getFilePath(`realms/${realmDir}/scripts/scripts-config/${scriptId}.json`)
  ) as any;
  if (!importData.name || importData.name.trim() === '') {
    throw new Error(
      `Script ${importData._id} must have a valid (non-blank) name!`
    );
  }
  const fullScriptPath = getFilePath(
    `realms/${realmDir}/scripts/${importData.script.file}`
  );
  importData.script = fs.readFileSync(fullScriptPath, 'utf8');
  const importedScript = await updateScript(importData._id, importData);
  if (!importedScript) {
    printMessage(`No change in script ${importData.name} - skipping update`);
  }
}

/**
 * Import scripts in fr-config-manager format
 * @param {string} realm option to determine which realm to import
 * @param {string} name option to import a specific script by name
 * @param {string} filenameFilter option to filter imported scripts
 * @param {boolean} allowFailures True to succeed although some scripts could not be imported (the failures are still summarised)
 * @returns True if Import was successful. A script that cannot be imported does not stop the others; the result is false if any failed, unless failures are allowed. A named script that is not in the config folder, a named realm without script config, and a config folder without a realms folder fail the command whatever the option says; a realm folder without script config is skipped with a warning.
 */
export async function configManagerImportScripts(
  realm?: string,
  name?: string,
  filenameFilter?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing scripts...'
  );

  try {
    const named = !!realm && realm !== DEFAULT_REALM_KEY;
    const realmsDir = `${getWorkingDirectory()}/realms`;
    let realms: string[];
    if (named) {
      realms = [realm === '/' ? 'root' : realm];
    } else {
      if (!fs.existsSync(realmsDir)) {
        stopProgressIndicator(
          indicatorId,
          `There is no 'realms' folder in '${getWorkingDirectory()}', so there are no scripts to push.`,
          'fail'
        );
        return false;
      }
      realms = fs
        .readdirSync(realmsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    }

    if (name && realms.length !== 1) {
      stopProgressIndicator(
        indicatorId,
        'For a named script, specify a single realm',
        'fail'
      );
      return false;
    }

    const run = new OperationRun({ unit: 'script', allowFailures });
    let scriptFound = false;
    let missingNamedConfig = false;

    for (const currentRealm of realms) {
      const realmName = currentRealm === 'root' ? '/' : currentRealm;

      if (
        realmName === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;

      state.setRealm(realmName);

      const configDir = `${getWorkingDirectory()}/realms/${currentRealm}/scripts/scripts-config`;
      if (!fs.existsSync(configDir)) {
        if (named) {
          printMessage(
            `No script config defined in realm ${currentRealm}. Expecting directory ${configDir}`,
            'error'
          );
          missingNamedConfig = true;
        } else {
          printMessage(
            `Warning: no script config defined in realm ${currentRealm}. Expecting directory ${configDir}`,
            'warn'
          );
        }
        continue;
      }
      const configFiles = fs
        .readdirSync(configDir)
        .filter((file) => file.endsWith('.json'));

      for (const file of configFiles) {
        const configPath = `${configDir}/${file}`;
        let label = file;
        try {
          const importData = readJsonFile(configPath) as any;
          label = importData.name || importData._id || file;

          if (!fileFilter(importData.script.file, filenameFilter)) {
            continue;
          }

          if (!importData.name || importData.name.trim() === '') {
            printMessage(
              `Script ${importData._id} must have a valid (non-blank) name!`,
              'error'
            );
            run.recordFailure(`${file} in realm ${currentRealm}`, 'blank name');
            continue;
          }

          if (name && importData.name !== name) continue;
          scriptFound = true;

          const fullScriptPath = getFilePath(
            `realms/${currentRealm}/scripts/${importData.script.file}`
          );
          delete importData.script.file;
          importData.script = fs.readFileSync(fullScriptPath, 'utf8');

          const importedScript = await updateScript(importData._id, importData);
          if (!importedScript)
            printMessage(
              `No change in script ${importData.name} - skipping update`
            );
          run.recordSuccess();
        } catch (error) {
          printError(
            error,
            `Error importing script '${label}' of realm '${currentRealm}'`
          );
          run.recordFailure(
            `${label} in realm ${currentRealm}`,
            causeOf(error)
          );
        }
      }
    }

    const notFound =
      !!name && !scriptFound && !missingNamedConfig && !run.hasFailures;
    if (notFound) {
      printMessage(
        `Script "${name}" not found in the script config of realm ${realms[0]}.`,
        'error'
      );
    }

    const failed = run.hasFailures || missingNamedConfig || notFound;
    stopProgressIndicator(
      indicatorId,
      failed
        ? 'Finished importing scripts with errors.'
        : 'Finished importing scripts.',
      failed ? 'fail' : 'success'
    );

    // a named realm without script config, or a named script that is in no file,
    // is not an operation that failed among others: it fails the command
    // whatever --allow-failures says
    return run.finish() && !missingNamedConfig && !notFound;
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
