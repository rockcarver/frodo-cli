import { frodo } from '@rockcarver/frodo-lib';
import { v4 as uuidv4 } from 'uuid';
import {
  createProgressIndicator,
  printError,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import fs from 'fs';
import * as path from 'path';

const { getFilePath, saveJsonToFile, getCurrentRealmName } = frodo.utils;
const {
  readThemes,
  deleteTheme: _deleteTheme,
  deleteThemeByName: _deleteThemeByName,
  deleteThemes: _deleteThemes,
} = frodo.theme;

/**
 * Determine HTML fields for config-manager style export
 */
const THEME_HTML_FIELDS = [
  { name: 'accountFooter', encoded: false },
  { name: 'journeyFooter', encoded: false },
  { name: 'journeyHeader', encoded: false },
  { name: 'journeyJustifiedContent', encoded: false },
  { name: 'journeyFooterScriptTag', encoded: true },
];

function decodeOrNot(input, encoded) {
  return encoded ? atob(input) : input;
}

/**
 * Process themes (extract HTML fields)
 */
function processThemes(themes, fileDir, name) {
  try {
    themes.forEach((theme) => {
      if (name && name !== theme.name) {
        return;
      }
      const themePath = `${fileDir}`;

      if (!fs.existsSync(themePath)) {
        fs.mkdirSync(themePath, { recursive: true });
      }

      for (const field of THEME_HTML_FIELDS) {
        if (!theme[field.name]) {
          continue;
        }

        switch (typeof theme[field.name]) {
          case 'string':
            {
              const fieldFilename = `${field.name}.html`;
              const breakoutFile = path.join(themePath, fieldFilename);
              fs.writeFileSync(
                breakoutFile,
                decodeOrNot(theme[field.name], field.encoded)
              );
              theme[field.name] = {
                file: fieldFilename,
              };
            }
            break;

          case 'object':
            // eslint-disable-next-line no-case-declarations
            const fieldPath = path.join(themePath, field.name);
            if (!fs.existsSync(fieldPath)) {
              fs.mkdirSync(fieldPath, { recursive: true });
            }

            Object.keys(theme[field.name]).forEach((locale) => {
              {
                const localeFilename = path.join(field.name, `${locale}.html`);
                const breakoutFile = path.join(themePath, localeFilename);
                fs.writeFileSync(
                  breakoutFile,
                  decodeOrNot(theme[field.name][locale], field.encoded)
                );
                theme[field.name][locale] = {
                  file: localeFilename,
                };
              }
            });
            break;

          default:
            console.error(
              `Error processing theme ${theme.name} - unexpected data type for ${field.name}: ${typeof theme[field.name]}`
            );
            process.exit(1);
        }
      }

      const fileName = `${themePath}/${theme.name}.json`;
      saveJsonToFile(theme, fileName, false);
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * Export all themes to separate files in fr-config-manager format
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportThemes() {
  let barId: string;
  try {
    const themes = await readThemes();
    barId = createProgressIndicator(
      'determinate',
      themes.length,
      'Exporting themes'
    );
    for (const theme of themes) {
      if (!theme._id) theme._id = uuidv4();
      const fileBarId = createProgressIndicator(
        'determinate',
        1,
        `Exporting theme ${theme.name}...`
      );
      updateProgressIndicator(barId, `Exporting theme ${theme.name}`);
      const fileDir = `realms/${getCurrentRealmName()}/themes/${theme.name}`;
      const file = getFilePath(`${fileDir}/${theme.name}.json`, true);
      processThemes([theme], fileDir, theme.name);
      updateProgressIndicator(fileBarId, `${theme.name} saved to ${file}`);
      stopProgressIndicator(fileBarId, `${theme.name} saved to ${file}.`);
    }
    return true;
  } catch (error) {
    stopProgressIndicator(barId, `Error exporting themes`, 'fail');
    printError(error);
  }
  return false;
}
