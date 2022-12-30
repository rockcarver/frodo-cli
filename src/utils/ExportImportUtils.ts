import fs from 'fs';
import slugify from 'slugify';
import { ExportImportUtils, state } from '@rockcarver/frodo-lib';
import { printMessage } from './Console';

const { getMetadata } = ExportImportUtils;

export function getTypedFilename(name: string, type: string, suffix = 'json') {
  const slug = slugify(name.replace(/^http(s?):\/\//, ''));
  return `${slug}.${type}.${suffix}`;
}

/**
 * Save JSON object to file
 * @param {Object} data data object
 * @param {String} filename file name
 */
export function saveJsonToFile(data, filename) {
  const exportData = data;
  if (!exportData.meta) exportData.meta = getMetadata();
  fs.writeFile(filename, JSON.stringify(exportData, null, 2), (err) => {
    if (err) {
      return printMessage(`ERROR - can't save ${filename}`, 'error');
    }
    return '';
  });
}

export function saveToFile(type, data, identifier, filename) {
  const exportData = {};
  exportData['meta'] = getMetadata();
  exportData[type] = {};

  if (Array.isArray(data)) {
    data.forEach((element) => {
      exportData[type][element[identifier]] = element;
    });
  } else {
    exportData[type][data[identifier]] = data;
  }
  fs.writeFile(filename, JSON.stringify(exportData, null, 2), (err) => {
    if (err) {
      return printMessage(`ERROR - can't save ${type} to file`, 'error');
    }
    return '';
  });
}

/*
 * Output str in title case
 *
 * e.g.: 'ALL UPPERCASE AND all lowercase' = 'All Uppercase And All Lowercase'
 */
export function titleCase(input) {
  const str = input.toString();
  const splitStr = str.toLowerCase().split(' ');
  for (let i = 0; i < splitStr.length; i += 1) {
    splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].slice(1);
  }
  return splitStr.join(' ');
}

export function getRealmString() {
  const realm = state.getRealm();
  return realm
    .split('/')
    .reduce((result, item) => `${result}${titleCase(item)}`, '');
}
