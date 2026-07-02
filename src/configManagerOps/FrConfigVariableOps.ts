import { frodo } from '@rockcarver/frodo-lib';
import { VariableSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';

import {
  createProgressIndicator,
  printError,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { escapePlaceholders, esvToEnv } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readVariables, readVariable } = frodo.cloud.variable;

/**
 * Export a single variable determined by name / id
 * @param {string} name variable name
 * @returns {Promise<boolean>} true is successful, false otherwise
 */
export async function configManagerExportVariableByName(
  name: string
): Promise<boolean> {
  let spinnerId: string;
  let indicatorId: string;
  let namedVariable: VariableSkeleton;
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Retrieving variable ${name}...`
    );
    namedVariable = await readVariable(name);
    stopProgressIndicator(
      spinnerId,
      `Successfully retrieved ${name}`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error retrieving ${name}`, 'fail');
    printError(error);
    return false;
  }
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting ${name}`
    );
    const envVariable = esvToEnv(namedVariable._id);

    const variableObject = {
      _id: namedVariable._id,
      expressionType: namedVariable.expressionType,
      description: escapePlaceholders(namedVariable.description),
      valueBase64: '${' + envVariable + '}',
    };

    saveJsonToFile(
      variableObject,
      getFilePath(`esv/variable/${namedVariable._id}.json`, true),
      false
    );
    updateProgressIndicator(indicatorId, `Writing ${name}`);
    stopProgressIndicator(indicatorId, `${name} exported`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting ${name}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all variables to seperate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportVariables(): Promise<boolean> {
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
        getFilePath(`esvs/variables/${variable._id}.json`, true),
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
