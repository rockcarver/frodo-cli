import fs from 'fs';
import { frodo, state, type ThemeSkeleton } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';
import { decodeOrNot, realmList } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath, constants } = frodo.utils;
const { readRealms, readRealmByName } = frodo.realm;
const { readThemes, importThemes } = frodo.theme;

const THEME_HTML_FIELDS = [
  { name: 'accountFooter', encoded: false },
  { name: 'journeyFooter', encoded: false },
  { name: 'journeyHeader', encoded: false },
  { name: 'journeyJustifiedContent', encoded: false },
  { name: 'journeyFooterScriptTag', encoded: true },
  { name: 'accountFooterScriptTag', encoded: true },
];

function extractHtmlFields(theme: ThemeSkeleton, themePath: string): void {
  for (const field of THEME_HTML_FIELDS) {
    if (!theme[field.name]) continue;

    switch (typeof theme[field.name]) {
      case 'string': {
        const fileName = `${field.name}.html`;
        const filePath = `${themePath}/${fileName}`;
        fs.writeFileSync(
          filePath,
          decodeOrNot(theme[field.name] as string, field.encoded)
        );
        theme[field.name] = { file: fileName };
        break;
      }

      case 'object': {
        const fieldDir = `${themePath}/${field.name}`;
        fs.mkdirSync(fieldDir, { recursive: true });

        for (const locale of Object.keys(theme[field.name])) {
          const localeFilename = `${locale}.html`;
          const filePath = `${fieldDir}/${localeFilename}`;
          fs.writeFileSync(
            filePath,
            decodeOrNot(theme[field.name][locale], field.encoded)
          );
          theme[field.name][locale] = {
            file: `${field.name}/${localeFilename}`,
          };
        }
        break;
      }

      default:
        throw new Error(`Unexpected type for ${field.name} in ${theme.name}`);
    }
  }
}

export async function configManagerExportThemes(
  realm?: string
): Promise<boolean> {
  try {
    const realmNames =
      realm && realm !== constants.DEFAULT_REALM_KEY
        ? [realm]
        : await realmList();
    for (const realm of realmNames) {
      // fr-config-manager doesn't support root themes
      if (realm === '/') continue;
      state.setRealm(realm);
      const themes = await readThemes();
      const exportDir = getFilePath(`realms/${realm}/themes`, true);
      fs.mkdirSync(exportDir, { recursive: true });
      for (const theme of themes) {
        const themeDir = `${exportDir}/${theme.name}`;
        fs.mkdirSync(themeDir, { recursive: true });
        extractHtmlFields(theme, themeDir);
        saveJsonToFile(theme, `${themeDir}/${theme.name}.json`, false);
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

export async function configManagerImportThemes(
  realm?: string
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== constants.DEFAULT_REALM_KEY
        ? [await readRealmByName(realm)]
        : await readRealms();
    for (const realm of realms) {
      // fr-config-manager doesn't support root themes
      if (realm.name === '/') continue;
      state.setRealm(realm.name);
      const importDir = getFilePath(
        `realms${realm.parentPath + realm.name}/themes`
      );
      const themesDir = fs
        .readdirSync(importDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
      const themeMap: Record<string, ThemeSkeleton> = {};
      for (const themeName of themesDir) {
        const themeDir = `${importDir}/${themeName}`;
        const themeJsonPath = `${themeDir}/${themeName}.json`;
        const theme: ThemeSkeleton = JSON.parse(
          fs.readFileSync(themeJsonPath, 'utf8')
        );
        for (const field of THEME_HTML_FIELDS) {
          if (
            !theme[field.name] ||
            typeof theme[field.name] !== 'object' ||
            typeof (theme[field.name] as any).file !== 'string'
          )
            continue;
          const fileName = (theme[field.name] as any).file;
          const filePath = `${themeDir}/${fileName}`;
          const fileContent = fs.readFileSync(filePath, 'utf8');
          theme[field.name] = fileContent;
        }
        themeMap[theme._id] = theme;
      }
      await importThemes({ theme: themeMap });
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
