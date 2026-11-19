import fs from 'fs';
import {
  frodo,
  state,
  type FrodoError,
  type ThemeExportInterface,
  type ThemeSkeleton,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { decodeOrNot, encodeOrNot, realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const {
  saveJsonToFile,
  getFilePath,
  readJsonFile,
  saveTextToFile,
  getWorkingDirectory,
} = frodo.utils;
const {
  readThemes,
  readTheme,
  readThemeByName,
  deleteTheme,
  deleteThemeByName,
  importThemes,
  deleteThemes,
} = frodo.theme;

const THEME_HTML_FIELDS = [
  { name: 'accountFooter', encoded: false },
  { name: 'journeyFooter', encoded: false },
  { name: 'journeyHeader', encoded: false },
  { name: 'journeyJustifiedContent', encoded: false },
  { name: 'journeyFooterScriptTag', encoded: true },
  { name: 'accountFooterScriptTag', encoded: true },
];

/**
 * Exports the themes of one realm to the config folder.
 * @param {string} realm The realm to export from
 * @param {string} id Optional id (`_id`) of the one theme to export
 * @param {string} name Optional name of the one theme to export
 * @returns {Promise<number>} how many themes were exported
 */
async function exportThemesOfRealm(
  realm: string,
  id?: string,
  name?: string
): Promise<number> {
  state.setRealm(realm);
  const realmDir = realm === '/' ? 'root' : realm;
  const themes = (await readThemes()).filter((theme) =>
    id !== undefined
      ? theme._id === id
      : name !== undefined
        ? theme.name === name
        : true
  );
  for (const theme of themes) {
    const themeDir = `realms/${realmDir}/themes/${theme.name}`;
    for (const field of THEME_HTML_FIELDS) {
      if (!theme[field.name]) continue;

      switch (typeof theme[field.name]) {
        case 'string':
          {
            const fileName = `${field.name}.html`;
            saveTextToFile(
              decodeOrNot(theme[field.name] as string, field.encoded),
              getFilePath(`${themeDir}/${fileName}`, true)
            );
            theme[field.name] = { file: fileName };
          }
          break;
        case 'object': {
          const fieldDir = `${themeDir}/${field.name}`;
          for (const locale of Object.keys(theme[field.name])) {
            const localeFilename = `${locale}.html`;
            saveTextToFile(
              decodeOrNot(theme[field.name][locale], field.encoded),
              getFilePath(`${fieldDir}/${localeFilename}`, true)
            );
            theme[field.name][locale] = {
              file: `${field.name}/${localeFilename}`,
            };
          }
          break;
        }
        default:
          throw new Error(
            `Unexpected data type for ${field.name}: ${typeof theme[field.name]}`
          );
      }
    }
    saveJsonToFile(
      theme,
      getFilePath(`${themeDir}/${theme.name}.json`, true),
      false
    );
  }
  return themes.length;
}

/**
 * Exports realms in fr-config-manager format. Every realm is its own operation:
 * a realm that cannot be exported is reported and does not stop the others, and
 * one summary names the realms that failed.
 * A theme can be selected by its id or by its name; the theme is looked for in
 * the list that an export of all themes reads, so no other request is made.
 * Like a named script, a theme that is selected (named: by id or by name) needs
 * a single realm, and a theme that the realm does not have fails the command
 * whatever `allowFailures` says.
 * @param {string} realm The realm to export from
 * @param {boolean} allowFailures True to succeed although some realms could not be exported (the failures are still summarised)
 * @param {string} id Optional id (`_id`) of the one theme to export
 * @param {string} name Optional name of the one theme to export
 * @returns {Promise<boolean>} a promise that evaluates to false if the realms cannot be listed or a realm could not be exported (unless failures are allowed), or a selected theme does not exist, true otherwise
 */
export async function configManagerExportThemes(
  realm?: string,
  allowFailures: boolean = false,
  id?: string,
  name?: string
): Promise<boolean> {
  const selected = id ?? name;
  try {
    const realmNames =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    if (selected !== undefined && realmNames.length !== 1) {
      printMessage('Error: for a named theme, specify a single realm', 'error');
      return false;
    }
    const run = new OperationRun({ unit: 'realm', allowFailures });
    let selectedNotFound = false;
    for (const currentRealm of realmNames) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        if (selected !== undefined) {
          printMessage(
            `The root realm of a Cloud tenant has no themes: nothing to pull for '${selected}'.`,
            'warn'
          );
        }
        continue;
      }
      try {
        const exported = await exportThemesOfRealm(currentRealm, id, name);
        if (selected !== undefined && exported === 0) {
          // the one theme that was asked for: nothing for the flag to allow
          printMessage(
            `Theme ${id !== undefined ? 'with id' : 'named'} '${selected}' not found in realm '${currentRealm}'.`,
            'error'
          );
          selectedNotFound = true;
        }
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting themes of realm '${currentRealm}'`);
        run.recordFailure(currentRealm, causeOf(error));
      }
    }
    return run.finish() && !selectedNotFound;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Reads the themes of one realm from the config folder.
 * @param {string} importDir The themes folder of the realm
 * @param {string} id Optional id (`_id`) of the one theme to read
 * @param {string} name Optional name of the one theme to read
 * @returns {ThemeExportInterface} the themes, ready to be imported: all of them, or only the one that was selected
 */
function readThemesOfRealm(
  importDir: string,
  id?: string,
  name?: string
): ThemeExportInterface {
  const themesDir = fs
    .readdirSync(importDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
  const importData: ThemeExportInterface = { theme: {} };
  for (const themeName of themesDir) {
    const themeDir = `${importDir}/${themeName}`;
    const theme = readJsonFile(
      `${themeDir}/${themeName}.json`
    ) as ThemeSkeleton;
    if (
      id !== undefined
        ? theme._id !== id
        : name !== undefined && theme.name !== name
    ) {
      continue;
    }
    for (const field of THEME_HTML_FIELDS) {
      if (!theme[field.name] || typeof theme[field.name] !== 'object') continue;
      if (typeof (theme[field.name] as any).file === 'string') {
        theme[field.name] = encodeOrNot(
          fs.readFileSync(
            `${themeDir}/${(theme[field.name] as any).file}`,
            'utf8'
          ),
          field.encoded
        );
        continue;
      }
      Object.keys(theme[field.name]).forEach((locale) => {
        theme[field.name][locale] = encodeOrNot(
          fs.readFileSync(
            `${themeDir}/${(theme[field.name][locale] as any).file}`,
            'utf8'
          ),
          field.encoded
        );
      });
    }
    importData.theme[theme._id] = theme;
  }
  return importData;
}

/**
 * Imports realms from fr-config-manager format. Every realm is its own
 * operation, because the library replaces the themes of a realm in one request:
 * a realm that cannot be imported is reported and does not stop the others, and
 * one summary names the realms that failed. A realm that was named but has no
 * themes folder fails the command; when all realms are imported, a realm
 * without a themes folder is skipped with a warning.
 * A theme can be selected by its id (`_id` of its file) or by its name, and then
 * only that theme is imported: the library merges it into the themes of the
 * realm and leaves the other themes alone. Like a named script, a selected
 * theme needs a single realm, and a theme that the config folder does not hold
 * fails the command whatever `allowFailures` says.
 * @param {string} realm The realm to import to
 * @param {boolean} allowFailures True to succeed although some realms could not be imported (the failures are still summarised)
 * @param {string} id Optional id (`_id`) of the one theme to import
 * @param {string} name Optional name of the one theme to import
 * @returns {Promise<boolean>} a promise that evaluates to false if the themes cannot be found or a realm could not be imported (unless failures are allowed), or a selected theme is not in the config folder, true otherwise
 */
export async function configManagerImportThemes(
  realm?: string,
  allowFailures: boolean = false,
  id?: string,
  name?: string
): Promise<boolean> {
  const selected = id ?? name;
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    const named = !!realm && realm !== DEFAULT_REALM_KEY;
    if (!named && !fs.existsSync(realmsDir)) {
      printMessage(
        `No themes to import: the folder '${realmsDir}' does not exist.`,
        'error'
      );
      return false;
    }
    const realms: string[] = named
      ? [realm === '/' ? 'root' : realm]
      : fs
          .readdirSync(realmsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
    if (selected !== undefined && realms.length !== 1) {
      printMessage('Error: for a named theme, specify a single realm', 'error');
      return false;
    }
    const run = new OperationRun({ unit: 'realm', allowFailures });
    let selectedFound = false;
    for (const realmDir of realms) {
      if (
        realmDir === 'root' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      const realmName = realmDir === 'root' ? '/' : realmDir;
      const importDir = `${realmsDir}/${realmDir}/themes`;
      if (!fs.existsSync(importDir)) {
        if (named) {
          printMessage(
            `No themes to import: the folder '${importDir}' does not exist.`,
            'error'
          );
          return false;
        }
        printMessage(
          `Skipping realm '${realmName}': it has no themes folder.`,
          'warn'
        );
        continue;
      }
      state.setRealm(realmName);
      try {
        const themes = readThemesOfRealm(importDir, id, name);
        if (selected !== undefined) {
          // the one theme that was asked for: the library is not asked at all without it
          if (Object.keys(themes.theme).length === 0) continue;
          selectedFound = true;
        }
        await importThemes(themes);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error importing themes of realm '${realmName}'`);
        run.recordFailure(realmName, causeOf(error));
      }
    }
    // a realm that was skipped (no themes folder, the root realm of a Cloud
    // tenant) cannot have held the theme, so it is not found either
    const notFound =
      selected !== undefined && !selectedFound && !run.hasFailures;
    if (notFound) {
      printMessage(
        `Theme ${id !== undefined ? 'with id' : 'named'} '${selected}' not found in the themes of realm '${realms[0] === 'root' ? '/' : realms[0]}'.`,
        'error'
      );
    }
    return run.finish() && !notFound;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Whether an error of the library only says that there is nothing to delete: a
 * realm without themes, or a theme that is not in the realm. It is told from
 * the message, because the library raises both as plain errors.
 * @param {unknown} error the error that was thrown
 * @returns {boolean} true if there was nothing to delete
 */
function isNothingToDelete(error: unknown): boolean {
  const message =
    typeof (error as FrodoError)?.getCombinedMessage === 'function'
      ? (error as FrodoError).getCombinedMessage()
      : String((error as Error)?.message ?? error);
  return /No theme configuration found for realm|not found in realm/.test(
    message
  );
}

/**
 * Delete themes in the specified realm, or in all listed realms if omitted.
 * Skips the root realm on Cloud deployments. Every realm is processed: one that
 * has nothing to delete is reported and skipped, one that fails is reported and
 * does not stop the others.
 * A theme that is not in the realm is an error when the realm was given, and a
 * warning when all realms are processed (fr-config-manager only warns).
 * An id that none of the realms has is an error too, also when all realms are
 * processed: it names one theme, so not finding it is no result.
 * @param {string} name Optional exact name of the theme to target.
 * @param {string} realm Optional realm to process.
 * @param {boolean} dryRun Show which themes would be deleted without deleting them.
 * @param {boolean} allowFailures True to succeed although some realms could not be processed (the failures are still summarised)
 * @param {string} id Optional id (`_id`) of the one theme to target instead of a name, an error when the realm was given and has no such theme; across realms a warning for each realm that lacks it, and an error when no realm has it. An empty id selects nothing (the command refuses an empty value before it connects).
 * @returns {Promise<boolean>} False if a realm could not be processed (unless failures are allowed); otherwise true.
 */
export async function configManagerDeleteThemes(
  name?: string,
  realm?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false,
  id?: string
): Promise<boolean> {
  // what the command line names: an id, or a name (an empty name means all themes)
  const selected = id ?? (name || undefined);
  try {
    const oneRealm = realm && realm !== DEFAULT_REALM_KEY;
    const realms = oneRealm ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'realm', allowFailures });
    // an id that was found in no realm of the run is an error (the id names one theme: not finding it is no result)
    let idFound = false;
    for (const currentRealm of realms) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      state.setRealm(currentRealm);
      try {
        const themes = dryRun
          ? id !== undefined
            ? [await readTheme(id)]
            : name
              ? [await readThemeByName(name)]
              : await readThemes()
          : id !== undefined
            ? [await deleteTheme(id)]
            : name
              ? [await deleteThemeByName(name)]
              : await deleteThemes(currentRealm);
        if (themes.length === 0) {
          printMessage(
            `No themes found to delete in realm '${currentRealm}'.`,
            'warn'
          );
          run.recordSuccess();
          continue;
        }
        for (const theme of themes) {
          printMessage(
            `${dryRun ? 'Dry run: ' : ''}Deleting theme '${theme.name}' in realm '${currentRealm}'`
          );
        }
        if (id !== undefined) idFound = true;
        run.recordSuccess();
      } catch (error) {
        if (isNothingToDelete(error) && (selected === undefined || !oneRealm)) {
          printMessage(
            selected !== undefined
              ? `Theme ${id !== undefined ? 'with id ' : ''}'${selected}' not found in realm '${currentRealm}'.`
              : `No themes found to delete in realm '${currentRealm}'.`,
            'warn'
          );
          run.recordSuccess();
          continue;
        }
        printError(error, `Error deleting themes in realm '${currentRealm}'`);
        run.recordFailure(currentRealm, causeOf(error));
      }
    }
    // a realm that failed has said why; a realm that was given and lacks the id is a failure already
    const idMissing = id !== undefined && !idFound && !run.hasFailures;
    if (idMissing) {
      printMessage(`Theme with id '${id}' not found in any realm.`, 'error');
    }
    return run.finish() && !idMissing;
  } catch (error) {
    printError(error);
    return false;
  }
}
