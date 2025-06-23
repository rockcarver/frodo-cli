import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import {
  ThemeExportInterface,
  type ThemeSkeleton,
} from '@rockcarver/frodo-lib/types/ops/ThemeOps';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

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

/**
 * Get a one-line description of the theme
 * @param {ThemeSkeleton} themeObj theme object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(themeObj: ThemeSkeleton): string {
  const description = `[${themeObj._id['brightCyan']}] ${themeObj.name}${
    themeObj.linkedTrees
      ? ' (' + themeObj.linkedTrees.join(', ')['brightCyan'] + ')'
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
          `${theme.isDefault ? theme.name['brightCyan'] : theme.name}`,
          'data'
        );
      });
    } else {
      const table = createTable([
        'Name'['brightCyan'],
        'Id'['brightCyan'],
        'Default'['brightCyan'],
      ]);
      themeList.forEach((theme) => {
        table.push([
          `${theme.name}`,
          `${theme._id}`,
          `${theme.isDefault ? 'Yes'['brightGreen'] : ''}`,
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
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportThemeByName(
  name: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    let fileName = getTypedFilename(name, 'theme');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting ${name}`
    );
    const themeData = await readThemeByName(name);
    if (!themeData._id) themeData._id = uuidv4();
    updateProgressIndicator(indicatorId, `Writing file to ${filePath}`);
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
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportThemeById(
  id: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    let fileName = getTypedFilename(id, 'theme');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    indicatorId = createProgressIndicator('determinate', 1, `Exporting ${id}`);
    const themeData = await readTheme(id);
    updateProgressIndicator(indicatorId, `Writing file to ${filePath}`);
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
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportThemesToFiles(includeMeta = true) {
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
      const file = getFilePath(getTypedFilename(theme.name, 'theme'), true);
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
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const themeExport: ThemeExportInterface = JSON.parse(data);
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
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const themeExport: ThemeExportInterface = JSON.parse(data);
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
    const data = fs.readFileSync(filePath, 'utf8');
    const themeExport: ThemeExportInterface = JSON.parse(data);
    await importThemes(themeExport);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported ${Object.keys(themeExport.theme).length} themes.`
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
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const jsonFiles = names
      .filter((name) => name.toLowerCase().endsWith('.theme.json'))
      .map((name) => getFilePath(name));

    indicatorId = createProgressIndicator(
      'determinate',
      jsonFiles.length,
      'Importing themes...'
    );
    let fileData = null;
    let count = 0;
    let total = 0;
    let files = 0;
    for (const file of jsonFiles) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        fileData = JSON.parse(data);
        count = Object.keys(fileData.theme).length;
        await importThemes(fileData);
        files += 1;
        total += count;
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} theme(s) from ${file}`
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing themes`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} theme(s) from ${files} file(s).`
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
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const themeExport = JSON.parse(data);
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
