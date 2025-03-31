import { frodo } from '@rockcarver/frodo-lib';
import { VariableSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';

import { getIdmImportExportOptions } from '../ops/IdmOps';
import {
  createProgressIndicator,
  printError,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const { exportConfigEntity } = frodo.idm.config;

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readVariables } = frodo.cloud.variable;

/**
 * Export all variables to seperate files
 * @param {boolean} noDecode Do not decode variable values. Default: false
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariablesToFiles(): Promise<boolean> {
  let spinnerId: string;
  let indicatorId: string;
  let variableList: VariableSkeleton[] = [];
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Retrieving variables...`
    );
    variableList = await readVariables();
    stopProgressIndicator(
      spinnerId,
      `Successfully retrieved ${variableList.length} variables`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error retrieving variables`, 'fail');
    printError(error);
    return false;
  }
  try {
    const indicatorId = createProgressIndicator(
      'determinate',
      variableList.length,
      'Exporting variables'
    );
    for (const variable of variableList) {
      const envVariable = esvToEnv(variable._id);

      const variableObject = {
        _id: variable._id,
        expressionType: variable.expressionType,
        description: escapePlaceholders(variable.description),
        valueBase64: '${' + envVariable + '}',
      };

      saveJsonToFile(
        variableObject,
        getFilePath(`esv/variables/${variable._id}.json`, true),
        false
      );
      updateProgressIndicator(indicatorId, `Writing variable ${variable._id}`);
    }
    stopProgressIndicator(
      indicatorId,
      `${variableList.length} variables exported`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting variables`);
    printError(error);
  }
  return false;
}

/**
 * Export an IDM configuration object.
 * @param {string} id the desired configuration object
 * @param {string} file optional export file name (or directory name if exporting mappings separately)
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} separateMappings separate sync.idm.json mappings if true (and id is "sync"), otherwise keep them in a single file
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportConfigEntityToFile(
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = (
      await exportConfigEntity('ui/configuration', {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: undefined,
      })
    ).idm['ui/configuration'];

    saveJsonToFile(
      exportData,
      getFilePath('ui-configuration.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
  }
  return false;
}

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} id the desired configuration object
 * @param {string} file optional export file name (or directory name if exporting mappings separately)
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @param {boolean} separateMappings separate sync.idm.json mappings if true (and id is "sync"), otherwise keep them in a single file
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportUiConfig(
  envFile?: string
): Promise<boolean> {
  try {
    const options = getIdmImportExportOptions(undefined, envFile);
    const exportData = (
      await exportConfigEntity('ui/configuration', {
        envReplaceParams: options.envReplaceParams,
        entitiesToExport: undefined,
      })
    ).idm['ui/configuration'];

    saveJsonToFile(
      exportData,
      getFilePath('ui/ui-configuration.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting config entity ui-configuration`);
  }
  return false;
}

function escapePlaceholders(content: string): string {
  return JSON.parse(JSON.stringify(content).replace(/\$\{/g, '\\\\${'));
}

function esvToEnv(esv: string): string {
  return esv.toUpperCase().replace(/-/g, '_');
}
