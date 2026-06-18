import { frodo } from '@rockcarver/frodo-lib';
import { VariableSkeleton } from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';
import fs from 'fs';

import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { escapePlaceholders, esvToEnv } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readVariables, importVariables } = frodo.cloud.variable;

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

/**
 * Import variables to tenant
 * @param { string } variableName name of the variable to import
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportVariables(
  variableName?: string
): Promise<boolean> {
  let indicatorId: string;

  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading variables...`
  );

  try {
    const variablesDir = getFilePath(`esvs/variables`);
    if (!fs.existsSync(variablesDir)) {
      stopProgressIndicator(spinnerId, `No variables directory found`, 'fail');
      return false;
    }

    const fileNames = fs
      .readdirSync(variablesDir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .filter((name) => !variableName || name === `${variableName}.json`);

    if (fileNames.length === 0) {
      stopProgressIndicator(
        spinnerId,
        variableName
          ? `No matching variable found for ${variableName}`
          : 'No variables found to import',
        'fail'
      );
      return false;
    }

    stopProgressIndicator(
      spinnerId,
      `Successfully read ${fileNames.length} variables.`,
      'success'
    );

    indicatorId = createProgressIndicator(
      'determinate',
      fileNames.length,
      'Importing variables'
    );

    const importData = {
      variable: Object.fromEntries(
        fileNames.map((fileName) => {
          const variable = readJsonFile(
            `${variablesDir}/${fileName}`
          ) as VariableSkeleton;
          // valueBase64 will not be encoded by this point, so set value so it encodes on import
          variable.value = variable.valueBase64;
          return [variable._id, variable];
        })
      ),
    };

    const imported = await importVariables(importData);

    let unchanged = 0;
    let updated = 0;

    for (const v of imported) {
      if (v.loaded) {
        printMessage(`Variable ${v._id} unchanged`);
        unchanged++;
      } else {
        printMessage(`Variable ${v._id} updated`);
        updated++;
      }
    }

    stopProgressIndicator(
      indicatorId,
      `${imported.length} variables imported.`
    );

    printMessage(
      updated > 0
        ? `Changes made to variables: ${updated} updated, ${unchanged} unchanged`
        : `No changes, (${unchanged} variable(s) already up to date)`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing variables`, 'fail');
    printError(error);
    return false;
  }
}
