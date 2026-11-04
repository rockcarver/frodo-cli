import fs from 'fs';
import path from 'path';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readConfigEntity, importConfigEntities, importSubConfigEntity } =
  frodo.idm.config;

/**
 * Export all mappings to separate files in fr-config-manager format
 * @param {string} name connector mapping name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportMappings(
  name?: string
): Promise<boolean> {
  try {
    const exportData = await readConfigEntity('sync');
    const fileDir = `sync/mappings`;
    for (const mapping of Object.values(exportData.mappings)) {
      if (name && name !== mapping.name) continue;
      const mappingPath = `${fileDir}/${mapping.name}`;

      Object.entries(mapping).forEach(([key, value]: [string, any]) => {
        if (
          value &&
          typeof value === 'object' &&
          value.type === 'text/javascript' &&
          value.source
        ) {
          const scriptText = Array.isArray(value.source)
            ? value.source.join('\n')
            : value.source;

          const scriptFilename = `${mapping.name}.${key}.js`;
          (value as any).file = scriptFilename; // Replace source code with file reference
          extractFrConfigDataToFile(scriptText, scriptFilename, mappingPath);

          delete value.source;
        }
      });

      const fileName = `${mappingPath}/${mapping.name}.json`;
      saveJsonToFile(mapping, getFilePath(fileName, true), false, true);
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting mappings to files`);
  }
  return false;
}

/**
 * Helper that recursively reads in extracted files and stores them back in the connector
 * @param {Record<string, any>} obj The connector configuration
 * @param {string} connectorMappingDirectory The directory where the connector resides
 */
function getExtractedFiles(obj: any, connectorMappingDirectory: string): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value?.type === 'text/javascript' && value.file) {
      const scriptPath = path.join(connectorMappingDirectory, value.file);
      if (fs.existsSync(scriptPath)) {
        value.source = fs.readFileSync(scriptPath, { encoding: 'utf-8' });
        delete value.file;
      }
    } else if (typeof value === 'object') {
      getExtractedFiles(value, connectorMappingDirectory);
    }
  }
}

/**
 * Helper that returns the import data for a connector mapping given the file where it is saved
 * @param {string} file The file where the connector mapping is saved
 * @returns {object} The connector mapping data from the file, including data from any extracted files
 */
function getConnectorMappingImportData(file: string): object {
  const importData = readJsonFile(file);
  getExtractedFiles(importData, path.dirname(file));
  return importData;
}

/**
 * Import all mappings in fr-config-manager format
 * @param {string} name optional connector name to import
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportMappings(
  name?: string
): Promise<boolean> {
  try {
    if (name) {
      const jsonFilePath = getFilePath(`sync/mappings/${name}/${name}.json`);
      const importData = getConnectorMappingImportData(jsonFilePath) as any;
      await importSubConfigEntity('sync', importData);
      return true;
    } else {
      const mappingDir = getFilePath('sync/mappings');
      const mappingFiles = fs.readdirSync(mappingDir);
      const importMappingData = {
        idm: { sync: { _id: 'sync', mappings: [] as any } },
      };
      for (const mappingFile of mappingFiles) {
        const jsonFilePath = getFilePath(
          `sync/mappings/${mappingFile}/${mappingFile}.json`
        );
        const importData = getConnectorMappingImportData(jsonFilePath) as any;
        if (importData.file) {
          const scriptPath = getFilePath(
            `sync/mappings/${mappingFile}/${importData.file}`
          );
          importData.source = fs.readFileSync(scriptPath, 'utf8');
          delete importData.file;
        }
        importMappingData.idm.sync.mappings.push(importData);
      }
      await importConfigEntities(importMappingData);
    }
    return true;
  } catch (error) {
    printError(error, `Error importing mappings from files`);
  }
  return false;
}
