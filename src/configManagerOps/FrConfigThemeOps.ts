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
  readThemeByName,
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
 * Exports realms in fr-config-manager format
 * @param {string} realm The realm to export from
 * @returns {Promise<boolean>} a promise that evaluates to true if successful, false otherwise
 */
export async function configManagerExportThemes(
  realm?: string
): Promise<boolean> {
  try {
    const realmNames =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    for (const realm of realmNames) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      const realmDir = realm === '/' ? 'root' : realm;
      const themes = await readThemes();
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
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Imports realms from fr-config-manager format
 * @param {string} realm The realm to import to
 * @returns {Promise<boolean>} a promise that evaluates to true if successful, false otherwise
 */
export async function configManagerImportThemes(
  realm?: string
): Promise<boolean> {
  try {
    const realms: string[] =
      realm && realm !== DEFAULT_REALM_KEY
        ? [realm === '/' ? 'root' : realm]
        : fs
            .readdirSync(`${getWorkingDirectory()}/realms`, {
              withFileTypes: true,
            })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);
    for (const realmDir of realms) {
      if (
        realmDir === 'root' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realmDir === 'root' ? '/' : realmDir);
      const importDir = `${getWorkingDirectory()}/realms/${realmDir}/themes`;
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
        for (const field of THEME_HTML_FIELDS) {
          if (!theme[field.name] || typeof theme[field.name] !== 'object')
            continue;
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
      await importThemes(importData);
    }
    return true;
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
 * @param {string} name Optional exact name of the theme to target.
 * @param {string} realm Optional realm to process.
 * @param {boolean} dryRun Show which themes would be deleted without deleting them.
 * @param {boolean} allowFailures True to succeed although some realms could not be processed (the failures are still summarised)
 * @returns {Promise<boolean>} False if a realm could not be processed (unless failures are allowed); otherwise true.
 */
export async function configManagerDeleteThemes(
  name?: string,
  realm?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const oneRealm = realm && realm !== DEFAULT_REALM_KEY;
    const realms = oneRealm ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'realm', allowFailures });
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
          ? name
            ? [await readThemeByName(name)]
            : await readThemes()
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
        run.recordSuccess();
      } catch (error) {
        if (isNothingToDelete(error) && (!name || !oneRealm)) {
          printMessage(
            name
              ? `Theme '${name}' not found in realm '${currentRealm}'.`
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
    return run.finish();
  } catch (error) {
    printError(error);
    return false;
  }
}
