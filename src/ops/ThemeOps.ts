import * as fs from 'fs';
import {
  frodo,
  type ThemeExportInterface,
  type ThemeSkeleton,
} from '@rockcarver/frodo-lib';
import { v4 as uuidv4 } from 'uuid';
import c from '../utils/ColorTheme';
import { extractDataToFile, getExtractedData } from '../utils/Config';
import {
  createProgressIndicator,
  createTable,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const {
  getRealmString,
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const {
  readThemes,
  readThemeByName,
  readTheme,
  updateThemeByName,
  updateTheme,
  importThemes,
  exportThemes,
  deleteTheme: _deleteTheme,
  deleteThemeByName: _deleteThemeByName,
  deleteThemes: _deleteThemes,
} = frodo.theme;

const THEME_HTML_PROPERTIES = [
  'accountFooter',
  'journeyFooter',
  'journeyHeader',
  'journeyJustifiedContent',
  'accountFooterScriptTag',
  'journeyFooterScriptTag',
];

/**
 * Get a one-line description of the theme
 * @param {ThemeSkeleton} themeObj theme object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(themeObj: ThemeSkeleton): string {
  const description = `[${c.heading(themeObj._id)}] ${themeObj.name}${
    themeObj.linkedTrees
      ? ' (' + c.heading(themeObj.linkedTrees.join(', ')) + ')'
      : ''
  }`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Name | Linked Journey(s) | Id |\n';
  markdown += '| ---- | ----------------- | ---|';
  return markdown;
}

/**
 * Get a table-row of the theme in markdown
 * @param {ThemeSkeleton} themeObj theme object to describe
 * @returns {string} a table-row of the theme in markdown
 */
export function getTableRowMd(themeObj: ThemeSkeleton): string {
  const row = `| ${themeObj.name} | ${
    themeObj.linkedTrees ? themeObj.linkedTrees.join(', ') : ''
  } | \`${themeObj._id}\` |`;
  return row;
}

/**
 * List all the themes
 * @param {boolean} long Long version, more fields
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listThemes(long: boolean = false): Promise<boolean> {
  try {
    const themeList = await readThemes();
    themeList.sort((a, b) => a.name.localeCompare(b.name));
    if (!long) {
      themeList.forEach((theme) => {
        printMessage(
          `${theme.isDefault ? c.heading(theme.name) : theme.name}`,
          'data'
        );
      });
    } else {
      const table = createTable([
        c.heading('Name'),
        c.heading('Id'),
        c.heading('Default'),
      ]);
      themeList.forEach((theme) => {
        table.push([
          `${theme.name}`,
          `${theme._id}`,
          `${theme.isDefault ? c.positive('Yes') : ''}`,
        ]);
      });
      printMessage(table.toString(), 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export theme by name to file
 * @param {string} name theme name
 * @param {string} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract extracts HTML into separate files if true. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportThemeByName(
  name: string,
  file: string,
  includeMeta: boolean = true,
  extract: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting ${name}`
    );
    const themeData = await readThemeByName(name);
    if (!themeData._id) themeData._id = uuidv4();
    let fileName = getTypedFilename(name, 'theme');
    if (extract) {
      extractThemeHTMLToFiles(
        { theme: { [themeData._id]: themeData } },
        themeData._id,
        name
      );
      fileName = `${name}/${fileName}`;
    } else if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    updateProgressIndicator(indicatorId, `Writing JSON file to ${filePath}`);
    saveToFile('theme', [themeData], '_id', filePath, includeMeta);
    stopProgressIndicator(indicatorId, `Successfully exported theme ${name}.`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting theme ${name}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export theme by uuid to file
 * @param {String} id theme uuid
 * @param {String} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract extracts HTML into separate files if true. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportThemeById(
  id: string,
  file: string,
  includeMeta: boolean = true,
  extract: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator('determinate', 1, `Exporting ${id}`);
    const themeData = await readTheme(id);
    let fileName = getTypedFilename(id, 'theme');
    if (extract) {
      extractThemeHTMLToFiles({ theme: { [id]: themeData } }, id, id);
      fileName = `${id}/${fileName}`;
    } else if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    updateProgressIndicator(indicatorId, `Writing JSON file to ${filePath}`);
    saveToFile('theme', [themeData], '_id', filePath, includeMeta);
    stopProgressIndicator(indicatorId, `Successfully exported theme ${id}.`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting theme ${id}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all themes to file
 * @param {String} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportThemesToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    let fileName = getTypedFilename(`all${getRealmString()}Themes`, 'theme');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportThemes();
    saveJsonToFile(exportData, filePath, includeMeta);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all themes to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} extract extracts HTML into separate files if true. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportThemesToFiles(
  includeMeta: boolean = true,
  extract: boolean = true
) {
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

      let fileName = getTypedFilename(theme.name, 'theme');

      if (extract) {
        extractThemeHTMLToFiles(
          { theme: { [theme._id]: theme } },
          theme._id,
          theme.name
        );
        fileName = `${theme.name}/${fileName}`;
      }

      const file = getFilePath(fileName, true);

      saveToFile('theme', theme, '_id', file, includeMeta);

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

/**
 * Import theme by name from file
 * @param {string} name theme name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importThemeByName(
  name: string,
  file: string
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing theme...'
    );
    const themeExport = getThemeExportFromFile(getFilePath(file));
    for (const id of Object.keys(themeExport.theme)) {
      if (themeExport.theme[id].name === name) {
        updateProgressIndicator(
          indicatorId,
          `Importing ${themeExport.theme[id].name}`
        );
        await updateThemeByName(name, themeExport.theme[id]);
        stopProgressIndicator(
          indicatorId,
          `Successfully imported theme ${name}.`
        );
        return true;
      }
    }
    stopProgressIndicator(indicatorId, `Theme ${name} not found!`, 'fail');
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing theme ${name}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import theme by uuid from file
 * @param {string} id theme uuid
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importThemeById(
  id: string,
  file: string
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing theme...'
    );
    const themeExport = getThemeExportFromFile(getFilePath(file));
    for (const themeId of Object.keys(themeExport.theme)) {
      if (themeId === id) {
        updateProgressIndicator(
          indicatorId,
          `Importing ${themeExport.theme[themeId]._id}`
        );
        await updateTheme(themeId, themeExport.theme[themeId]);
        stopProgressIndicator(
          indicatorId,
          `Successfully imported theme ${id}.`
        );
        return true;
      }
    }
    stopProgressIndicator(indicatorId, `Theme ${id} not found!`, 'fail');
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing theme ${id}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import all themes from single file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importThemesFromFile(file: string): Promise<boolean> {
  let indicatorId: string;
  try {
    const filePath = getFilePath(file);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing themes from ${filePath}...`
    );
    const themeExport = getThemeExportFromFile(filePath);
    await importThemes(themeExport);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported ${Object.keys(themeExport.theme).length} themes from ${filePath}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing themes`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import themes from separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importThemesFromFiles(): Promise<boolean> {
  let indicatorId: string;
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const jsonFiles: string[] = [];
    for (const name of names) {
      const filePath = getFilePath(name);
      if (
        fs.statSync(filePath).isFile() &&
        name.toLowerCase().endsWith('.theme.json')
      ) {
        jsonFiles.push(name);
        continue;
      }
      if (fs.statSync(filePath).isDirectory()) {
        const files = fs.readdirSync(filePath);
        const themeFile = files.find(
          (file) =>
            fs.statSync(`${filePath}/${file}`).isFile() &&
            file.toLowerCase().endsWith('.theme.json')
        );
        if (themeFile) {
          jsonFiles.push(`${name}/${themeFile}`);
        }
      }
    }
    indicatorId = createProgressIndicator(
      'determinate',
      jsonFiles.length,
      'Importing themes...'
    );
    let numFiles = 0;
    for (const file of jsonFiles) {
      const success = await importThemesFromFile(file);
      if (!success) continue;
      numFiles += 1;
      updateProgressIndicator(indicatorId, `Imported theme(s) from ${file}`);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing themes from ${numFiles} file(s).`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing themes`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import first theme from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstThemeFromFile(file: string): Promise<boolean> {
  let indicatorId: string;
  try {
    const themeExport = getThemeExportFromFile(getFilePath(file));
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing theme...'
    );
    for (const id of Object.keys(themeExport.theme)) {
      updateProgressIndicator(
        indicatorId,
        `Importing ${themeExport.theme[id].name}`
      );
      await updateTheme(id, themeExport.theme[id]);
      stopProgressIndicator(
        indicatorId,
        `Successfully imported theme ${themeExport.theme[id].name}`
      );
      return true;
    }
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing first theme`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete theme by id
 * @param {string} id theme id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteTheme(id: string): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${id}...`
  );
  try {
    await _deleteTheme(id);
    stopProgressIndicator(indicatorId, `Deleted ${id}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error deleting theme`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete theme by name
 * @param {string} name theme name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteThemeByName(name: string): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${name}...`
  );
  try {
    await _deleteThemeByName(name);
    stopProgressIndicator(indicatorId, `Deleted ${name}.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error: ${error.message}`, 'fail');
  }
  return false;
}

/**
 * Delete all themes
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteThemes(): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting all realm themes...`
  );
  try {
    await _deleteThemes();
    stopProgressIndicator(indicatorId, `Deleted all realm themes.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error: ${error.message}`, 'fail');
  }
  return false;
}

/**
 * Extract a theme HTML property to a file
 * @param {ThemeSkeleton} theme theme object containing the property
 * @param {string} property theme property to extract
 * @param {string} directory directory within the base directory to save the HTML file
 */
function extractHTMLToFile(
  theme: ThemeSkeleton,
  property: string,
  directory?: string
): void {
  const htmlData = theme[property];
  if (!htmlData) return;

  if (typeof htmlData === 'object') {
    for (const [language, html] of Object.entries(htmlData)) {
      htmlData[language] = extractDataToFile(
        html,
        `${property}/${getTypedFilename(language, 'theme', 'html')}`,
        directory
      );
    }
  } else {
    theme[property] = extractDataToFile(
      htmlData,
      getTypedFilename(property, 'theme', 'html'),
      directory
    );
  }
}

/**
 * Extracts HTML from a theme export into separate files
 * @param {ThemeExportInterface} exportData theme export
 * @param {string} themeId theme id to extract a specific theme from. If undefined, extracts HTML from all themes
 * @param {string} directory directory within the base directory to save the HTML files
 * @returns {boolean} true if successful, false otherwise
 */
export function extractThemeHTMLToFiles(
  exportData: ThemeExportInterface,
  themeId?: string,
  directory?: string
): boolean {
  try {
    const themes = themeId
      ? [exportData.theme[themeId]]
      : Object.values(exportData.theme);
    for (const theme of themes) {
      for (const property of THEME_HTML_PROPERTIES) {
        extractHTMLToFile(theme, property, directory);
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Read an extracted theme HTML property from a file
 * @param {ThemeSkeleton} theme theme object containing the property
 * @param {string} property theme property to read
 * @param {string} [directory] directory containing the extracted HTML file
 */
function readHTMLFromFile(
  theme: ThemeSkeleton,
  property: string,
  directory?: string
): void {
  if (!theme[property]) return;

  if (typeof theme[property] === 'object') {
    for (const [language, filePath] of Object.entries(theme[property])) {
      const fileContent = getExtractedData(filePath, directory);
      if (fileContent !== null) {
        theme[property][language] = fileContent;
      }
    }
  } else {
    const fileContent = getExtractedData(theme[property] as string, directory);
    if (fileContent !== null) {
      theme[property] = fileContent;
    }
  }
}

/**
 * Get a theme export from json file
 * @param {string} file path to the theme export file
 * @returns {ThemeExportInterface} theme export
 */
export function getThemeExportFromFile(file: string): ThemeExportInterface {
  const exportData = JSON.parse(
    fs.readFileSync(file, 'utf8')
  ) as ThemeExportInterface;

  const directory = file.substring(0, file.lastIndexOf('/'));

  for (const theme of Object.values(exportData.theme)) {
    for (const property of THEME_HTML_PROPERTIES) {
      readHTMLFromFile(theme, property, directory);
    }
  }

  return exportData;
}
