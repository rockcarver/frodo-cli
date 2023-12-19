import { frodo } from '@rockcarver/frodo-lib';
import {
  ThemeExportInterface,
  type ThemeSkeleton,
} from '@rockcarver/frodo-lib/types/ops/ThemeOps';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

import {
  createProgressIndicator,
  createTable,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const {
  getRealmString,
  validateImport,
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
  updateThemes,
  exportThemes,
  deleteTheme,
  deleteThemeByName,
  deleteThemes,
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
 */
export async function listThemes(long = false) {
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
}

/**
 * Export theme by name to file
 * @param {String} name theme name
 * @param {String} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportThemeByName(name, file, includeMeta = true) {
  let fileName = getTypedFilename(name, 'theme');
  if (file) {
    fileName = file;
  }
  const filePath = getFilePath(fileName, true);
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${name}`
  );
  try {
    const themeData = await readThemeByName(name);
    if (!themeData._id) themeData._id = uuidv4();
    updateProgressIndicator(indicatorId, `Writing file to ${filePath}`);
    saveToFile('theme', [themeData], '_id', filePath, includeMeta);
    stopProgressIndicator(indicatorId, `Successfully exported theme ${name}.`);
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error.message}`);
    printMessage(`${error.message}`, 'error');
  }
}

/**
 * Export theme by uuid to file
 * @param {String} id theme uuid
 * @param {String} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportThemeById(id, file, includeMeta = true) {
  let fileName = getTypedFilename(id, 'theme');
  if (file) {
    fileName = file;
  }
  const filePath = getFilePath(fileName, true);
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${id}`
  );
  try {
    const themeData = await readTheme(id);
    updateProgressIndicator(indicatorId, `Writing file to ${filePath}`);
    saveToFile('theme', [themeData], '_id', filePath, includeMeta);
    stopProgressIndicator(indicatorId, `Successfully exported theme ${id}.`);
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error.message}`);
    printMessage(`${error.message}`, 'error');
  }
}

/**
 * Export all themes to file
 * @param {String} file optional export file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportThemesToFile(file, includeMeta = true) {
  let fileName = getTypedFilename(`all${getRealmString()}Themes`, 'theme');
  if (file) {
    fileName = file;
  }
  const filePath = getFilePath(fileName, true);
  const exportData = await exportThemes();
  saveJsonToFile(exportData, filePath, includeMeta);
}

/**
 * Export all themes to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportThemesToFiles(includeMeta = true) {
  const themes = await readThemes();
  const barId = createProgressIndicator(
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
  stopProgressIndicator(barId, `${themes.length} themes exported.`);
}

/**
 * Import theme by name from file
 * @param {String} name theme name
 * @param {String} file import file name
 */
export async function importThemeByName(name, file) {
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const themeExport: ThemeExportInterface = JSON.parse(data);
    const indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing theme...'
    );
    let found = false;
    for (const id of Object.keys(themeExport.theme)) {
      if (themeExport.theme[id].name === name) {
        found = true;
        updateProgressIndicator(
          indicatorId,
          `Importing ${themeExport.theme[id].name}`
        );
        try {
          await updateThemeByName(name, themeExport.theme[id]);
          stopProgressIndicator(
            indicatorId,
            `Successfully imported theme ${name}.`
          );
        } catch (error) {
          stopProgressIndicator(
            indicatorId,
            `Error importing theme ${themeExport.theme[id].name}: ${error.message}`
          );
          printMessage(
            `Error importing theme ${themeExport.theme[id].name}: ${error.message}`,
            'error'
          );
        }
        break;
      }
    }
    if (!found) {
      stopProgressIndicator(indicatorId, `Theme ${name} not found!`);
    }
  } catch (error) {
    printMessage(`Error importing theme ${name}: ${error}`, 'error');
  }
}

/**
 * Import theme by uuid from file
 * @param {String} id theme uuid
 * @param {String} file import file name
 */
export async function importThemeById(id, file) {
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const themeExport: ThemeExportInterface = JSON.parse(data);
    const indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing theme...'
    );
    let found = false;
    for (const themeId of Object.keys(themeExport.theme)) {
      if (themeId === id) {
        found = true;
        updateProgressIndicator(
          indicatorId,
          `Importing ${themeExport.theme[themeId]._id}`
        );
        try {
          await updateTheme(themeId, themeExport.theme[themeId]);
          stopProgressIndicator(
            indicatorId,
            `Successfully imported theme ${id}.`
          );
        } catch (error) {
          stopProgressIndicator(
            indicatorId,
            `Error importing theme ${themeExport.theme[themeId]._id}: ${error.message}`
          );
          printMessage(
            `Error importing theme ${themeExport.theme[themeId]._id}: ${error.message}`,
            'error'
          );
        }
        break;
      }
    }
    if (!found) {
      stopProgressIndicator(indicatorId, `Theme ${id} not found!`);
    }
  } catch (error) {
    printMessage(`Error importing theme ${id}: ${error}`, 'error');
  }
}

/**
 * Import all themes from single file
 * @param {String} file import file name
 */
export async function importThemesFromFile(file) {
  const filePath = getFilePath(file);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const themeExport: ThemeExportInterface = JSON.parse(data);
    const indicatorId = createProgressIndicator(
      'determinate',
      Object.keys(themeExport.theme).length,
      'Importing themes...'
    );
    for (const id of Object.keys(themeExport.theme)) {
      updateProgressIndicator(
        indicatorId,
        `Importing ${themeExport.theme[id].name}`
      );
    }
    const result = await updateThemes(themeExport.theme);
    if (result == null) {
      stopProgressIndicator(
        indicatorId,
        `Error importing ${Object.keys(themeExport.theme).length} themes!`
      );
      printMessage(
        `Error importing ${
          Object.keys(themeExport.theme).length
        } themes from ${filePath}`,
        'error'
      );
    } else {
      stopProgressIndicator(
        indicatorId,
        `Successfully imported ${Object.keys(themeExport.theme).length} themes.`
      );
    }
  } catch (error) {
    printMessage(`Error importing themes: ${error}`, 'error');
  }
}

/**
 * Import themes from separate files
 */
export async function importThemesFromFiles() {
  const names = fs.readdirSync(getWorkingDirectory());
  const jsonFiles = names
    .filter((name) => name.toLowerCase().endsWith('.theme.json'))
    .map((name) => getFilePath(name));

  const indicatorId = createProgressIndicator(
    'determinate',
    jsonFiles.length,
    'Importing themes...'
  );
  let fileData = null;
  let count = 0;
  let total = 0;
  let files = 0;
  for (const file of jsonFiles) {
    const data = fs.readFileSync(file, 'utf8');
    fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      count = Object.keys(fileData.theme).length;
      // eslint-disable-next-line no-await-in-loop
      const result = await updateThemes(fileData.theme);
      if (result == null) {
        printMessage(`Error importing ${count} themes from ${file}`, 'error');
      } else {
        files += 1;
        total += count;
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} theme(s) from ${file}`
        );
      }
    } else {
      printMessage(`Validation of ${file} failed!`, 'error');
    }
  }
  stopProgressIndicator(
    indicatorId,
    `Finished importing ${total} theme(s) from ${files} file(s).`
  );
}

/**
 * Import first theme from file
 * @param {String} file import file name
 */
export async function importFirstThemeFromFile(file) {
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const themeExport = JSON.parse(data);
    const indicatorId = createProgressIndicator(
      'determinate',
      1,
      'Importing theme...'
    );
    for (const id of Object.keys(themeExport.theme)) {
      updateProgressIndicator(
        indicatorId,
        `Importing ${themeExport.theme[id].name}`
      );
      updateTheme(id, themeExport.theme[id]).then((result) => {
        if (result == null) {
          stopProgressIndicator(
            indicatorId,
            `Error importing theme ${themeExport.theme[id].name}`
          );
          printMessage(
            `Error importing theme ${themeExport.theme[id].name}`,
            'error'
          );
        } else {
          stopProgressIndicator(
            indicatorId,
            `Successfully imported theme ${themeExport.theme[id].name}`
          );
        }
      });
      break;
    }
  } catch (error) {
    printMessage(`Error importing themes: ${error}`, 'error');
  }
}

/**
 * Delete theme by id
 * @param {String} id theme id
 */
export async function deleteThemeCmd(id) {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${id}...`
  );
  try {
    await deleteTheme(id);
    stopProgressIndicator(indicatorId, `Deleted ${id}.`, 'success');
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error: ${error.message}`, 'fail');
  }
}

/**
 * Delete theme by name
 * @param {String} name theme name
 */
export async function deleteThemeByNameCmd(name) {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting ${name}...`
  );
  try {
    await deleteThemeByName(name);
    stopProgressIndicator(indicatorId, `Deleted ${name}.`, 'success');
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error: ${error.message}`, 'fail');
  }
}

/**
 * Delete all themes
 */
export async function deleteAllThemes() {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting all realm themes...`
  );
  try {
    await deleteThemes();
    stopProgressIndicator(indicatorId, `Deleted all realm themes.`, 'success');
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error: ${error.message}`, 'fail');
  }
}

/**
 * Delete all themes
 * @deprecated since version 0.14.0
 */
export async function deleteThemesCmd() {
  return deleteAllThemes();
}
