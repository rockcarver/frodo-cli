import { frodo, state } from '@rockcarver/frodo-lib';
import { VariableExpressionType } from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';

import {
  createKeyValueTable,
  createProgressBar,
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressBar,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressBar,
  updateProgressIndicator,
} from '../utils/Console';
import {
  getTypedFilename,
  saveJsonToFile,
  saveToFile,
  titleCase,
} from '../utils/ExportImportUtils';
import wordwrap from './utils/Wordwrap';

const { decodeBase64, getFilePath } = frodo.utils;
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
 * @param {boolean} long Long version, all the fields
 */
export async function listVariables(long) {
  let variables = [];
  try {
    variables = await readVariables();
    variables.sort((a, b) => a._id.localeCompare(b._id));
  } catch (error) {
    printMessage(`${error.message}`, 'error');
    printMessage(error.response.data, 'error');
  }
  if (long) {
    const table = createTable([
      'Id'['brightCyan'],
      'Value'['brightCyan'],
      'Status'['brightCyan'],
      'Description'['brightCyan'],
      'Modifier'['brightCyan'],
      'Modified (UTC)'['brightCyan'],
    ]);
    for (const variable of variables) {
      table.push([
        variable._id,
        wordwrap(decodeBase64(variable.valueBase64), 40),
        variable.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
        wordwrap(variable.description, 40),
        state.getUseBearerTokenForAmApis()
          ? variable.lastChangedBy
          : await resolvePerpetratorUuid(variable.lastChangedBy),
        new Date(variable.lastChangeDate).toUTCString(),
      ]);
    }
    printMessage(table.toString(), 'data');
  } else {
    variables.forEach((variable) => {
      printMessage(variable._id, 'data');
    });
  }
}

/**
 * Create variable
 * @param {string} variableId variable id
 * @param {string} value variable value
 * @param {string} description variable description
 * @param {VariableExpressionType} type variable type
 */
export async function createVariable(
  variableId: string,
  value: string,
  description: string,
  type: VariableExpressionType = 'string'
) {
  showSpinner(`Creating variable ${variableId}...`);
  try {
    await _updateVariable(variableId, value, description, type);
    succeedSpinner(`Created variable ${variableId}`);
  } catch (error) {
    failSpinner(
      error.response
        ? `Error: ${error.response.data.code} - ${error.response.data.message}`
        : error
    );
  }
}

/**
 * Update variable
 * @param {string} variableId variable id
 * @param {string} value variable value
 * @param {string} description variable description
 */
export async function updateVariable(variableId, value, description) {
  showSpinner(`Updating variable ${variableId}...`);
  try {
    await _updateVariable(variableId, value, description);
    succeedSpinner(`Updated variable ${variableId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Set description of variable
 * @param {string} variableId variable id
 * @param {string} description variable description
 */
export async function setVariableDescription(variableId, description) {
  showSpinner(`Setting description of variable ${variableId}...`);
  try {
    await updateVariableDescription(variableId, description);
    succeedSpinner(`Set description of variable ${variableId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Delete a variable
 * @param {string} variableId variable id
 */
export async function deleteVariableById(variableId) {
  showSpinner(`Deleting variable ${variableId}...`);
  try {
    await deleteVariable(variableId);
    succeedSpinner(`Deleted variable ${variableId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Delete all variables
 */
export async function deleteVariables() {
  try {
    const variables = await readVariables();
    createProgressBar(variables.length, `Deleting variable...`);
    for (const variable of variables) {
      try {
        await deleteVariable(variable._id);
        updateProgressBar(`Deleted variable ${variable._id}`);
      } catch (error) {
        printMessage(
          `Error: ${error.response.data.code} - ${error.response.data.message}`,
          'error'
        );
      }
    }
    stopProgressBar(`Variables deleted.`);
  } catch (error) {
    stopProgressBar(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
    printMessage(
      `Error: ${error.response.data.code} - ${error.response.data.message}`,
      'error'
    );
  }
}

/**
 * Describe a variable
 * @param {string} variableId variable id
 */
export async function describeVariable(variableId, json = false) {
  const variable = await readVariable(variableId);
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
    const modifierName = await resolvePerpetratorUuid(variable.lastChangedBy);
    if (modifierName && modifierName !== variable.lastChangedBy) {
      table.push(['Modifier'['brightCyan'], modifierName]);
    }
    table.push(['Modifier UUID'['brightCyan'], variable.lastChangedBy]);
    printMessage(table.toString(), 'data');
  }
}

/**
 * Export a single variable to file
 * @param {String} variableId Variable id
 * @param {String} file Optional filename
 * @param {boolean} noDecode Do not include decoded variable value in export
 */
export async function exportVariableToFile(
  variableId: string,
  file: string | null,
  noDecode: boolean
) {
  debugMessage(
    `Cli.VariablesOps.exportVariableToFile: start [variableId=${variableId}, file=${file}]`
  );
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(variableId, 'variable');
  }
  const filePath = getFilePath(fileName, true);
  try {
    createProgressBar(1, `Exporting variable ${variableId}`);
    const fileData = await exportVariable(variableId, noDecode);
    saveJsonToFile(fileData, filePath);
    updateProgressBar(`Exported variable ${variableId}`);
    stopProgressBar(
      // @ts-expect-error - brightCyan colors the string, even though it is not a property of string
      `Exported ${variableId.brightCyan} to ${filePath.brightCyan}.`
    );
  } catch (err) {
    stopProgressBar(`${err}`);
    printMessage(err, 'error');
  }
  debugMessage(
    `Cli.VariablesOps.exportVariableToFile: end [variableId=${variableId}, file=${file}]`
  );
}

/**
 * Export all variables to single file
 * @param {string} file Optional filename
 * @param {boolean} noDecode Do not include decoded variable value in export
 */
export async function exportVariablesToFile(
  file: string | null,
  noDecode: boolean
) {
  debugMessage(`Cli.VariablesOps.exportVariablesToFile: start [file=${file}]`);
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(
      `all${titleCase(state.getRealm())}Variables`,
      'variable'
    );
  }
  try {
    const variablesExport = await exportVariables(noDecode);
    saveJsonToFile(variablesExport, getFilePath(fileName, true));
  } catch (error) {
    printMessage(error.message, 'error');
    printMessage(`exportVariablesToFile: ${error.response?.status}`, 'error');
  }
  debugMessage(`Cli.VariablesOps.exportVariablesToFile: end [file=${file}]`);
}

/**
 * Export all variables to seperate files
 * @param {boolean} noDecode Do not include decoded variable value in export
 */
export async function exportVariablesToFiles(noDecode: boolean) {
  const variableList = await readVariables();
  createProgressIndicator(
    'determinate',
    variableList.length,
    'Exporting variables'
  );
  for (const variable of variableList) {
    if (!noDecode) {
      variable.value = decodeBase64(variable.valueBase64);
    }
    updateProgressIndicator(`Writing variable ${variable._id}`);
    const fileName = getTypedFilename(variable._id, 'variable');
    saveToFile('variable', variable, '_id', getFilePath(fileName, true));
  }
  stopProgressIndicator(`${variableList.length} variables exported`);
}
