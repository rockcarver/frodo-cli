import { frodo } from '@rockcarver/frodo-lib';
import { MappingExportOptions } from '@rockcarver/frodo-lib/types/ops/MappingOps';
import fs from 'fs';
import * as path from 'path';

import { printError } from '../utils/Console';

const { exportMappings } = frodo.idm.mapping;
const { saveJsonToFile } = frodo.utils;

function processMappings(mappings, targetDir, name) {
  try {
    mappings.forEach((mapping) => {
      if (name && name !== mapping.name) {
        return;
      }

      const mappingPath = `${targetDir}`;

      if (!fs.existsSync(mappingPath)) {
        fs.mkdirSync(mappingPath, { recursive: true });
      }

      Object.entries(mapping).forEach(([key, value]) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          'type' in value &&
          'source' in value &&
          value.type === 'text/javascript'
        ) {
          const scriptFilename = `${mapping.name}.${key}.js`;
          (value as any).file = scriptFilename; // Replace source code with file reference
          fs.writeFileSync(
            path.join(mappingPath, scriptFilename),
            (value as any).source
          );
          delete (value as any).source;
        }
      });

      const fileName = `${mappingPath}/${mapping.name}.json`;
      saveJsonToFile(mapping, fileName, false);
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * Export all mappings to separate files in fr-config-manager format
 * @param {MappingExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportMappings(
  options: MappingExportOptions = {
    deps: true,
    useStringArrays: true,
  }
): Promise<boolean> {
  try {
    const exportData = await exportMappings(options);
    const fileDir = `sync/mappings`;
    for (const mapping of Object.values(exportData.sync.mappings)) {
      processMappings([mapping], `${fileDir}/${mapping.name}`, mapping.name);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting mappings to files`);
  }
  return false;
}
