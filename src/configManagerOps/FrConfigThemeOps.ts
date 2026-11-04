import fs from 'fs';
import {
  frodo,
  state,
  type ThemeExportInterface,
  type ThemeSkeleton,
} from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';
import { decodeOrNot, encodeOrNot, realmList } from '../utils/FrConfig';

const { DEFAULT_REALM_KEY, CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const {
  saveJsonToFile,
  getFilePath,
  readJsonFile,
  saveTextToFile,
  getWorkingDirectory,
} = frodo.utils;
const { readThemes, importThemes } = frodo.theme;

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
