import { frodo } from '@rockcarver/frodo-lib';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readConfigEntity } = frodo.idm.config;

function processMappings(mapping, targetDir, name) {
  try {
    if (name && name !== mapping.name) {
      return;
    }
    const mappingPath = `${targetDir}`;

    Object.entries(mapping).forEach(([key, value]: [string, any]) => {
      if (
        typeof value === 'object' &&
        value !== null &&
        'type' in value &&
        'source' in value &&
        value.type === 'text/javascript'
      ) {
        const scriptText = Array.isArray(value.source)
          ? value.source.join('\n')
          : value.source;

        const scriptFilename = `${mapping.name}.${key}.js`;
        (value as any).file = scriptFilename; // Replace source code with file reference
        extractFrConfigDataToFile(scriptText, scriptFilename, targetDir);

        delete value.source;
      }
    });

    const fileName = `${mappingPath}/${mapping.name}.json`;
    saveJsonToFile(mapping, getFilePath(fileName, true), false, true);
  } catch (err) {
    printError(err);
  }
}

/**
 * Export all mappings to separate files in fr-config-manager format
 * @param {MappingExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportMappings(): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('sync');
    const fileDir = `sync/mappings`;
    for (const mapping of Object.values(exportData.mappings)) {
      processMappings(mapping, `${fileDir}/${mapping.name}`, mapping.name);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting mappings to files`);
  }
  return false;
}
