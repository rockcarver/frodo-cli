import { frodo, state } from '@rockcarver/frodo-lib';
import {
  VariableExpressionType,
  VariableSkeleton,
} from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';

import { getFullExportConfig, isIdUsed } from '../utils/Config';
import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import wordwrap from './utils/Wordwrap';

const {
  decodeBase64,
  getFilePath,
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  titleCase,
} = frodo.utils;
const { resolvePerpetratorUuid } = frodo.idm.managed;
const {
  readVariables,
  readVariable,
  exportVariable,
  exportVariables,
  deleteVariable,
  updateVariableDescription,
  updateVariable: _updateVariable,
} = frodo.cloud.variable;

/**
 * List variables
 * @param {boolean} long Long version, all the fields besides usage
 * @param {boolean} usage Display usage field
 * @param {String | null} file Optional filename to determine usage
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listVariables(
  long: boolean = false,
  usage: boolean = false,
  file: string | null = null
): Promise<boolean> {
  let spinnerId: string;
  let variables: VariableSkeleton[] = [];
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Reading variables...`
    );
    variables = await readVariables();
    variables.sort((a, b) => a._id.localeCompare(b._id));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${variables.length} variables.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error reading variables: ${error.response?.data || error.message}`,
      'fail'
    );
    return false;
  }
  if (!long && !usage) {
    variables.forEach((variable) => {
      printMessage(variable._id, 'data');
    });
    return true;
  }
  let fullExport = null;
  const headers = long
    ? [
        'Id'['brightCyan'],
        'Value'['brightCyan'],
        'Status'['brightCyan'],
        'Description'['brightCyan'],
        'Modifier'['brightCyan'],
        'Modified (UTC)'['brightCyan'],
      ]
    : ['Id'['brightCyan']];
  if (usage) {
    try {
      fullExport = await getFullExportConfig(file);
    } catch (error) {
      printMessage(
        `Error getting full export: ${error.response?.data || error.message}`,
        'error'
      );
      return false;
    }
    //Delete variables from full export so they aren't mistakenly used for determining usage
    delete fullExport.variables;
    headers.push('Used'['brightCyan']);
  }
  const table = createTable(headers);
  for (const variable of variables) {
    const values = long
      ? [
          variable._id,
          wordwrap(decodeBase64(variable.valueBase64), 40),
          variable.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
          wordwrap(variable.description, 40),
          state.getUseBearerTokenForAmApis()
            ? variable.lastChangedBy
            : await resolvePerpetratorUuid(variable.lastChangedBy),
          new Date(variable.lastChangeDate).toUTCString(),
        ]
      : [variable._id];
    if (usage) {
      const isEsvUsed = isIdUsed(fullExport, variable._id, true);
      values.push(
        isEsvUsed.used
          ? `${'yes'['brightGreen']} (at ${isEsvUsed.location})`
          : 'no'['brightRed']
      );
    }
    table.push(values);
  }
  printMessage(table.toString(), 'data');
  return true;
}

/**
 * Create variable
 * @param {string} variableId variable id
 * @param {string} value variable value
 * @param {string} description variable description
 * @param {VariableExpressionType} type variable type
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createVariable(
  variableId: string,
  value: string,
  description: string,
  type: VariableExpressionType = 'string'
): Promise<boolean> {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Creating variable ${variableId}...`
  );
  try {
    await _updateVariable(variableId, value, description, type);
    stopProgressIndicator(
      spinnerId,
      `Created variable ${variableId}`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      error.response
        ? `Error: ${error.response.data.code} - ${error.response.data.message}`
        : error,
      'fail'
    );
  }
  return outcome;
}

/**
 * Update variable
 * @param {string} variableId variable id
 * @param {string} value variable value
 * @param {string} description variable description
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function updateVariable(variableId, value, description) {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Updating variable ${variableId}...`
  );
  try {
    await _updateVariable(variableId, value, description);
    stopProgressIndicator(
      spinnerId,
      `Updated variable ${variableId}`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error: ${error.response.data.code} - ${error.response.data.message}`,
      'fail'
    );
  }
  return outcome;
}

/**
 * Set description of variable
 * @param {string} variableId variable id
 * @param {string} description variable description
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function setVariableDescription(variableId, description) {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Setting description of variable ${variableId}...`
  );
  try {
    await updateVariableDescription(variableId, description);
    stopProgressIndicator(
      spinnerId,
      `Set description of variable ${variableId}`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error: ${error.response.data.code} - ${error.response.data.message}`,
      'fail'
    );
  }
  return outcome;
}

/**
 * Delete a variable
 * @param {string} variableId variable id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteVariableById(variableId) {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Deleting variable ${variableId}...`
  );
  try {
    await deleteVariable(variableId);
    stopProgressIndicator(
      spinnerId,
      `Deleted variable ${variableId}`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error: ${error.response.data.code} - ${error.response.data.message}`,
      'fail'
    );
  }
  return outcome;
}

/**
 * Delete all variables
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteVariables() {
  let outcome = false;
  let indicatorId: string;
  try {
    const variables = await readVariables();
    indicatorId = createProgressIndicator(
      'determinate',
      variables.length,
      `Deleting variable...`
    );
    for (const variable of variables) {
      try {
        await deleteVariable(variable._id);
        updateProgressIndicator(
          indicatorId,
          `Deleted variable ${variable._id}`
        );
      } catch (error) {
        printMessage(
          `Error: ${error.response.data.code} - ${error.response.data.message}`,
          'error'
        );
      }
    }
    outcome = true;
    stopProgressIndicator(indicatorId, `Variables deleted.`);
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
    printMessage(
      `Error: ${error.response.data.code} - ${error.response.data.message}`,
      'error'
    );
  }
  return outcome;
}

/**
 * Describe a variable
 * @param {string} variableId variable id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeVariable(variableId, json = false) {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Describing variable ${variableId}...`
  );
  try {
    const variable = await readVariable(variableId);
    stopProgressIndicator(
      spinnerId,
      `Successfully retrieved variable ${variableId}`,
      'success'
    );
    if (json) {
      printMessage(variable, 'data');
    } else {
      const table = createKeyValueTable();
      table.push(['Name'['brightCyan'], variable._id]);
      table.push([
        'Value'['brightCyan'],
        wordwrap(decodeBase64(variable.valueBase64), 40),
      ]);
      table.push(['Type'['brightCyan'], variable.expressionType]);
      table.push([
        'Status'['brightCyan'],
        variable.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
      ]);
      table.push([
        'Description'['brightCyan'],
        wordwrap(variable.description, 60),
      ]);
      table.push([
        'Modified'['brightCyan'],
        new Date(variable.lastChangeDate).toLocaleString(),
      ]);
      let modifierName: string;
      try {
        modifierName = await resolvePerpetratorUuid(variable.lastChangedBy);
      } catch (error) {
        // ignore
      }
      if (modifierName && modifierName !== variable.lastChangedBy) {
        table.push(['Modifier'['brightCyan'], modifierName]);
      }
      table.push(['Modifier UUID'['brightCyan'], variable.lastChangedBy]);
      printMessage(table.toString(), 'data');
    }
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error describing variable ${variableId}`,
      'fail'
    );
  }
  return outcome;
}

/**
 * Export a single variable to file
 * @param {String} variableId Variable id
 * @param {String} file Optional filename
 * @param {boolean} noDecode Do not include decoded variable value in export
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariableToFile(
  variableId: string,
  file: string | null,
  noDecode: boolean,
  includeMeta: boolean
) {
  debugMessage(
    `Cli.VariablesOps.exportVariableToFile: start [variableId=${variableId}, file=${file}]`
  );
  let outcome = false;
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(variableId, 'variable');
  }
  const filePath = getFilePath(fileName, true);
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting variable ${variableId}`
    );
    const fileData = await exportVariable(variableId, noDecode);
    saveJsonToFile(fileData, filePath, includeMeta);
    updateProgressIndicator(indicatorId, `Exported variable ${variableId}`);
    stopProgressIndicator(
      indicatorId,
      // @ts-expect-error - brightCyan colors the string, even though it is not a property of string
      `Exported ${variableId.brightCyan} to ${filePath.brightCyan}.`
    );
    outcome = true;
  } catch (err) {
    stopProgressIndicator(indicatorId, `${err}`);
    printMessage(err, 'error');
  }
  debugMessage(
    `Cli.VariablesOps.exportVariableToFile: end [variableId=${variableId}, file=${file}]`
  );
  return outcome;
}

/**
 * Export all variables to single file
 * @param {string} file Optional filename
 * @param {boolean} noDecode Do not include decoded variable value in export
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariablesToFile(
  file: string | null,
  noDecode: boolean,
  includeMeta: boolean
) {
  debugMessage(`Cli.VariablesOps.exportVariablesToFile: start [file=${file}]`);
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Exporting variables...`
  );
  if (!file) {
    file = getTypedFilename(
      `all${titleCase(state.getRealm())}Variables`,
      'variable'
    );
  }
  try {
    const variablesExport = await exportVariables(noDecode);
    saveJsonToFile(variablesExport, getFilePath(file, true), includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported variables to ${file}`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error exporting variables: ${error.response?.status || error.message}`,
      'fail'
    );
  }
  debugMessage(
    `Cli.VariablesOps.exportVariablesToFile: end [outcome=${outcome}, file=${file}]`
  );
  return outcome;
}

/**
 * Export all variables to seperate files
 * @param {boolean} noDecode Do not include decoded variable value in export
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariablesToFiles(
  noDecode: boolean,
  includeMeta: boolean
) {
  let outcome = false;
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
    stopProgressIndicator(
      spinnerId,
      `Error retrieving variables: ${error.message}`,
      'fail'
    );
  }
  try {
    const indicatorId = createProgressIndicator(
      'determinate',
      variableList.length,
      'Exporting variables'
    );
    for (const variable of variableList) {
      if (!noDecode) {
        variable.value = decodeBase64(variable.valueBase64);
      }
      updateProgressIndicator(indicatorId, `Writing variable ${variable._id}`);
      const fileName = getTypedFilename(variable._id, 'variable');
      saveToFile(
        'variable',
        variable,
        '_id',
        getFilePath(fileName, true),
        includeMeta
      );
    }
    stopProgressIndicator(
      indicatorId,
      `${variableList.length} variables exported`
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting variables: ${error.message}`
    );
  }
  return outcome;
}
