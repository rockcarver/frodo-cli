import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  VariableExpressionType,
  VariableSkeleton,
} from '@rockcarver/frodo-lib/types/api/cloud/VariablesApi';
import { VariablesExportInterface } from '@rockcarver/frodo-lib/types/ops/cloud/VariablesOps';
import fs from 'fs';

import { getFullExportConfig, getIdLocations } from '../../utils/Config';
import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../../utils/Console';
import wordwrap from '../utils/Wordwrap';

const {
  decodeBase64,
  getFilePath,
  getTypedFilename,
  getWorkingDirectory,
  saveJsonToFile,
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
  importVariable,
  importVariables,
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
    stopProgressIndicator(spinnerId, `Error reading variables`, 'fail');
    printError(error);
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
      printMessage(`Error determining variable usage`, 'error');
      printError(error);
      return false;
    }
    //Delete variables from full export so they aren't mistakenly used for determining usage
    delete fullExport.global.variables;
    headers.push('Used'['brightCyan']);
  }
  const table = createTable(headers);
  for (const variable of variables) {
    const values = long
      ? [
          variable._id,
          wordwrap(
            variable.valueBase64
              ? decodeBase64(variable.valueBase64)
              : variable.value,
            40
          ),
          variable.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
          wordwrap(variable.description, 40),
          state.getUseBearerTokenForAmApis()
            ? variable.lastChangedBy
            : await resolvePerpetratorUuid(variable.lastChangedBy),
          new Date(variable.lastChangeDate).toUTCString(),
        ]
      : [variable._id];
    if (usage) {
      const locations = getIdLocations(fullExport, variable._id, true);
      values.push(
        locations.length > 0
          ? `${'yes'['brightGreen']} (${locations.length === 1 ? `at` : `${locations.length} uses, including:`} ${locations[0]})`
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
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      error.response ? `Error creating variable ${variableId}` : error,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Update variable
 * @param {string} variableId variable id
 * @param {string} value variable value
 * @param {string} description variable description
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function updateVariable(
  variableId: string,
  value: string,
  description: string
): Promise<boolean> {
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
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error updating variable ${variableId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Set description of variable
 * @param {string} variableId variable id
 * @param {string} description variable description
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function setVariableDescription(
  variableId: string,
  description: string
): Promise<boolean> {
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
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error setting description of variable ${variableId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete a variable
 * @param {string} variableId variable id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteVariableById(variableId: string): Promise<boolean> {
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
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error deleting variable ${variableId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete all variables
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteVariables(): Promise<boolean> {
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
    stopProgressIndicator(indicatorId, `Variables deleted`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error deleting variables`);
    printError(error);
  }
  return false;
}

/**
 * Describe a variable
 * @param {string} variableId variable id
 * @param {string} file optional export file
 * @param {boolean} usage true to describe usage, false otherwise. Default: false
 * @param {boolean} json output description as json. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeVariable(
  variableId: string,
  file?: string,
  usage = false,
  json = false
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Describing variable ${variableId}...`
  );
  try {
    const variable = (await readVariable(variableId)) as VariableSkeleton & {
      locations: string[];
    };
    if (usage) {
      try {
        const fullExport = await getFullExportConfig(file);
        //Delete variables from full export so they aren't mistakenly used for determining usage
        delete fullExport.global.variables;
        variable.locations = getIdLocations(fullExport, variableId, true);
      } catch (error) {
        stopProgressIndicator(
          spinnerId,
          `Error determining usage for variable with id ${variableId}`,
          'fail'
        );
        printError(error);
        return false;
      }
    }
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
        wordwrap(
          variable.valueBase64
            ? decodeBase64(variable.valueBase64)
            : variable.value,
          40
        ),
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
      if (usage) {
        table.push([
          `Usage Locations (${variable.locations.length} total)`['brightCyan'],
          variable.locations.length > 0 ? variable.locations[0] : '',
        ]);
        for (let i = 1; i < variable.locations.length; i++) {
          table.push(['', variable.locations[i]]);
        }
      }
      printMessage(table.toString(), 'data');
    }
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error describing variable ${variableId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export a single variable to file
 * @param {String} variableId Variable id
 * @param {String} file Optional filename
 * @param {boolean} noDecode Do not decode variable value. Default: false
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariableToFile(
  variableId: string,
  file: string | null,
  noDecode: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  debugMessage(
    `Cli.VariablesOps.exportVariableToFile: start [variableId=${variableId}, file=${file}, noDecode=${noDecode}]`
  );
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
      `Exported ${variableId['brightCyan']} to ${filePath['brightCyan']}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting variable ${variableId['brightCyan']} to ${filePath['brightCyan']}`,
      'fail'
    );
    printError(error);
  }
  debugMessage(
    `Cli.VariablesOps.exportVariableToFile: end [variableId=${variableId}, file=${file}]`
  );
  return false;
}

/**
 * Export all variables to single file
 * @param {string} file Optional filename
 * @param {boolean} noDecode Do not decode variable values. Default: false
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariablesToFile(
  file: string | null,
  noDecode: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
  debugMessage(
    `Cli.VariablesOps.exportVariablesToFile: start [file=${file}, noDecode=${noDecode}]`
  );
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Exporting variables...`
  );
  if (!file) {
    file = getTypedFilename(`allVariables`, 'variable');
  }
  try {
    const variablesExport = await exportVariables(noDecode);
    saveJsonToFile(variablesExport, getFilePath(file, true), includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported variables to ${file}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error exporting variables to ${getFilePath(file)['brightCyan']}`,
      'fail'
    );
  }
  debugMessage(`Cli.VariablesOps.exportVariablesToFile: end [file=${file}]`);
  return false;
}

/**
 * Export all variables to seperate files
 * @param {boolean} noDecode Do not decode variable values. Default: false
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportVariablesToFiles(
  noDecode: boolean = false,
  includeMeta: boolean = true
): Promise<boolean> {
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
      const fileName = getTypedFilename(variable._id, 'variable');
      const exportData: VariablesExportInterface = await exportVariable(
        variable._id,
        noDecode
      );
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
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
 * Import variable from file
 * @param {string} variableId variable id/name
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importVariableFromFile(
  variableId: string,
  file: string
): Promise<boolean> {
  debugMessage(`cli.VariablesOps.importVariableFromFile: begin`);
  showSpinner(`Importing ${variableId ? variableId : 'first variable'}...`);
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const importData = JSON.parse(data);
    await importVariable(variableId, importData);
    succeedSpinner(`Imported ${variableId ? variableId : 'first variable'}.`);
    debugMessage(`cli.VariablesOps.importVariableFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(
      `Error importing ${variableId ? variableId : 'first variable'}`
    );
    printError(error);
  }
  return false;
}

/**
 * Import variables from file
 * @param {string} file file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importVariablesFromFile(file: string): Promise<boolean> {
  debugMessage(`cli.VariablesOps.importVariablesFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importVariables(fileData);
    succeedSpinner(`Imported ${filePath}.`);
    debugMessage(`cli.VariablesOps.importVariablesFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${filePath}`);
    printError(error);
  }
  return false;
}

/**
 * Import variables from files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importVariablesFromFiles(): Promise<boolean> {
  const errors = [];
  let indicatorId: string;
  try {
    debugMessage(`cli.VariablesOps.importVariablesFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.variable.json'))
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing variables...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: VariablesExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.variables).length;
        total += count;
        await importVariables(fileData);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} variables from ${file}`
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing variables`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} variables from ${files.length} files.`
    );
    debugMessage(`cli.VariablesOps.importVariablesFromFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing variables`);
    printError(error);
  }
  return false;
}
