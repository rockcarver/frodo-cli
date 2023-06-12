import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { ThemeSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import {
  printMessage,
  createTable,
  createProgressIndicator,
  updateProgressIndicator,
  stopProgressIndicator,
} from '../utils/Console';
import { saveToFile, getTypedFilename } from '../utils/ExportImportUtils';

const {
  getTheme,
  getThemes,
  getThemeByName,
  putThemeByName,
  putTheme,
  putThemes,
  deleteTheme,
  deleteThemeByName,
  deleteThemes,
} = frodo.theme;
const { getRealmString, validateImport } = frodo.utils.impex;
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
  const themeList = await getThemes();
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
 */
export async function exportThemeByName(name, file) {
  let fileName = getTypedFilename(name, 'theme');
  if (file) {
    fileName = file;
  }
  createProgressIndicator('determinate', 1, `Exporting ${name}`);
  try {
    const themeData = await getThemeByName(name);
    updateProgressIndicator(`Writing file ${fileName}`);
    saveToFile('theme', [themeData], '_id', fileName);
    stopProgressIndicator(`Successfully exported theme ${name}.`);
  } catch (error) {
    stopProgressIndicator(`${error.message}`);
    printMessage(`${error.message}`, 'error');
  }
}

/**
 * Export theme by uuid to file
 * @param {String} id theme uuid
 * @param {String} file optional export file name
 */
export async function exportThemeById(id, file) {
  let fileName = getTypedFilename(id, 'theme');
  if (file) {
    fileName = file;
  }
  createProgressIndicator('determinate', 1, `Exporting ${id}`);
  try {
    const themeData = await getTheme(id);
    updateProgressIndicator(`Writing file ${fileName}`);
    saveToFile('theme', [themeData], '_id', fileName);
    stopProgressIndicator(`Successfully exported theme ${id}.`);
  } catch (error) {
    stopProgressIndicator(`${error.message}`);
    printMessage(`${error.message}`, 'error');
  }
}

/**
 * Export all themes to file
 * @param {String} file optional export file name
 */
export async function exportThemesToFile(file) {
  let fileName = getTypedFilename(`all${getRealmString()}Themes`, 'theme');
  if (file) {
    fileName = file;
  }
  const allThemesData = await getThemes();
  createProgressIndicator(
    'determinate',
    allThemesData.length,
    'Exporting themes'
  );
  for (const themeData of allThemesData) {
    updateProgressIndicator(`Exporting theme ${themeData.name}`);
  }
  saveToFile('theme', allThemesData, '_id', fileName);
  stopProgressIndicator(
    `${allThemesData.length} themes exported to ${fileName}.`
  );
}

/**
 * Export all themes to separate files
 */
export async function exportThemesToFiles() {
  const allThemesData = await getThemes();
  createProgressIndicator(
    'determinate',
    allThemesData.length,
    'Exporting themes'
  );
  for (const themeData of allThemesData) {
    updateProgressIndicator(`Writing theme ${themeData.name}`);
    const fileName = getTypedFilename(themeData.name, 'theme');
    saveToFile('theme', themeData, '_id', fileName);
  }
  stopProgressIndicator(`${allThemesData.length} themes exported.`);
}

/**
 * Import theme by name from file
 * @param {String} name theme name
 * @param {String} file import file name
 */
export async function importThemeByName(name, file) {
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const themeData = JSON.parse(data);
    if (validateImport(themeData.meta)) {
      createProgressIndicator('determinate', 1, 'Importing theme...');
      let found = false;
      for (const id in themeData.theme) {
        if ({}.hasOwnProperty.call(themeData.theme, id)) {
          if (themeData.theme[id].name === name) {
            found = true;
            updateProgressIndicator(`Importing ${themeData.theme[id].name}`);
            try {
              await putThemeByName(name, themeData.theme[id]);
              stopProgressIndicator(`Successfully imported theme ${name}.`);
            } catch (error) {
              stopProgressIndicator(
                `Error importing theme ${themeData.theme[id].name}: ${error.message}`
              );
              printMessage(
                `Error importing theme ${themeData.theme[id].name}: ${error.message}`,
                'error'
              );
            }
            break;
          }
        }
      }
      if (!found) {
        stopProgressIndicator(`Theme ${name} not found!`);
      }
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Import theme by uuid from file
 * @param {String} id theme uuid
 * @param {String} file import file name
 */
export async function importThemeById(id, file) {
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const themeData = JSON.parse(data);
    if (validateImport(themeData.meta)) {
      createProgressIndicator('determinate', 1, 'Importing theme...');
      let found = false;
      for (const themeId in themeData.theme) {
        if ({}.hasOwnProperty.call(themeData.theme, themeId)) {
          if (themeId === id) {
            found = true;
            updateProgressIndicator(
              `Importing ${themeData.theme[themeId]._id}`
            );
            try {
              await putTheme(themeId, themeData.theme[themeId]);
              stopProgressIndicator(`Successfully imported theme ${id}.`);
            } catch (error) {
              stopProgressIndicator(
                `Error importing theme ${themeData.theme[themeId]._id}: ${error.message}`
              );
              printMessage(
                `Error importing theme ${themeData.theme[themeId]._id}: ${error.message}`,
                'error'
              );
            }
            break;
          }
        }
      }
      if (!found) {
        stopProgressIndicator(`Theme ${id} not found!`);
      }
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Import all themes from single file
 * @param {String} file import file name
 */
export async function importThemesFromFile(file) {
  fs.readFile(file, 'utf8', (err, data) => {
    if (err) throw err;
    const fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      createProgressIndicator(
        'determinate',
        Object.keys(fileData.theme).length,
        'Importing themes...'
      );
      for (const id in fileData.theme) {
        if ({}.hasOwnProperty.call(fileData.theme, id)) {
          updateProgressIndicator(`Importing ${fileData.theme[id].name}`);
        }
      }
      putThemes(fileData.theme).then((result) => {
        if (result == null) {
          stopProgressIndicator(
            `Error importing ${Object.keys(fileData.theme).length} themes!`
          );
          printMessage(
            `Error importing ${
              Object.keys(fileData.theme).length
            } themes from ${file}`,
            'error'
          );
        } else {
          stopProgressIndicator(
            `Successfully imported ${
              Object.keys(fileData.theme).length
            } themes.`
          );
        }
      });
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Import themes from separate files
 */
export async function importThemesFromFiles() {
  const names = fs.readdirSync('.');
  const jsonFiles = names.filter((name) =>
    name.toLowerCase().endsWith('.theme.json')
  );

  createProgressIndicator(
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
      const result = await putThemes(fileData.theme);
      if (result == null) {
        printMessage(`Error importing ${count} themes from ${file}`, 'error');
      } else {
        files += 1;
        total += count;
        updateProgressIndicator(`Imported ${count} theme(s) from ${file}`);
      }
    } else {
      printMessage(`Validation of ${file} failed!`, 'error');
    }
  }
  stopProgressIndicator(
    `Finished importing ${total} theme(s) from ${files} file(s).`
  );
}

/**
 * Import first theme from file
 * @param {String} file import file name
 */
export async function importFirstThemeFromFile(file) {
  fs.readFile(file, 'utf8', (err, data) => {
    if (err) throw err;
    const themeData = JSON.parse(data);
    if (validateImport(themeData.meta)) {
      createProgressIndicator('determinate', 1, 'Importing theme...');
      for (const id in themeData.theme) {
        if ({}.hasOwnProperty.call(themeData.theme, id)) {
          updateProgressIndicator(`Importing ${themeData.theme[id].name}`);
          putTheme(id, themeData.theme[id]).then((result) => {
            if (result == null) {
              stopProgressIndicator(
                `Error importing theme ${themeData.theme[id].name}`
              );
              printMessage(
                `Error importing theme ${themeData.theme[id].name}`,
                'error'
              );
            } else {
              stopProgressIndicator(
                `Successfully imported theme ${themeData.theme[id].name}`
              );
            }
          });
          break;
        }
      }
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Delete theme by id
 * @param {String} id theme id
 */
export async function deleteThemeCmd(id) {
  createProgressIndicator('indeterminate', undefined, `Deleting ${id}...`);
  try {
    await deleteTheme(id);
    stopProgressIndicator(`Deleted ${id}.`, 'success');
  } catch (error) {
    stopProgressIndicator(`Error: ${error.message}`, 'fail');
  }
}

/**
 * Delete theme by name
 * @param {String} name theme name
 */
export async function deleteThemeByNameCmd(name) {
  createProgressIndicator('indeterminate', undefined, `Deleting ${name}...`);
  try {
    await deleteThemeByName(name);
    stopProgressIndicator(`Deleted ${name}.`, 'success');
  } catch (error) {
    stopProgressIndicator(`Error: ${error.message}`, 'fail');
  }
}

/**
 * Delete all themes
 */
export async function deleteAllThemes() {
  createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting all realm themes...`
  );
  try {
    await deleteThemes();
    stopProgressIndicator(`Deleted all realm themes.`, 'success');
  } catch (error) {
    stopProgressIndicator(`Error: ${error.message}`, 'fail');
  }
}

/**
 * Delete all themes
 * @deprecated since version 0.14.0
 */
export async function deleteThemesCmd() {
  return deleteAllThemes();
}
