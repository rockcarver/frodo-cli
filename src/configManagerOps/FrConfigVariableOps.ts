import fs from 'fs';
import { frodo, type VariableSkeleton } from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import {
  csvEscape,
  escapePlaceholders,
  esvToEnv,
  friendlyTimestamp,
} from '../utils/FrConfig';
import { countItems, recordImportOfFile } from '../utils/ImportItems';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readVariables, importVariables, deleteVariable } = frodo.cloud.variable;

/**
 * Format a variable as a shell assignment, `NAME='value'`, that can be sourced.
 * A single quote in the value is written as `'\''`, so a value such as `it's`
 * does not end the quoted string early. Values without a single quote come out
 * as they always did.
 * @param {string} name environment variable name
 * @param {unknown} value variable value
 * @returns {string} the assignment
 */
export function formatEnvAssignment(name: string, value: unknown): string {
  return `${name}='${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

/**
 * Export all variables to individual files in fr-config-manager format
 * Every variable is one operation of an {@link OperationRun}: a variable whose file cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the variables ends the command whatever `--allow-failures` says, and so does the report, which
 * is one operation.
 * @param {boolean} report true to report in csv format
 * @param {boolean} dump true to dump variable values to the console
 * @param {boolean} allowFailures true to report variables that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportVariables(
  report?: boolean,
  dump?: boolean,
  allowFailures: boolean = false
): Promise<boolean> {
  let spinnerId: string;
  let variableList: VariableSkeleton[];
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

  if (report) {
    printMessage('Name, Description, Type, Value, Last Changed', 'data');
    for (const variable of variableList) {
      printMessage(
        [
          variable._id,
          csvEscape(variable.description),
          variable.expressionType,
          csvEscape(variable.value),
          friendlyTimestamp(variable.lastChangeDate),
        ].join(','),
        'data'
      );
    }
    return true;
  }

  const run = new OperationRun({ unit: 'variable', allowFailures });
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'determinate',
      variableList.length,
      'Exporting variables'
    );
    for (const variable of variableList) {
      await run.run(variable._id, () => {
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

        if (dump) {
          printMessage(
            formatEnvAssignment(envVariable, variable.value),
            'data'
          );
        }
      });

      updateProgressIndicator(indicatorId, `Writing variable ${variable._id}`);
    }
    if (run.hasFailures) {
      stopProgressIndicator(
        indicatorId,
        'Some variables could not be exported.',
        'fail'
      );
    } else {
      stopProgressIndicator(
        indicatorId,
        `${variableList.length} variables exported`
      );
    }
    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting variables`);
    printError(error);
    if (run.hasFailures) run.finish();
  }
  return false;
}

/**
 * Import variables to tenant
 * Every file is read on its own: a file that cannot be read is printed and named in the one
 * summary, and the variables of the other files are still imported. The variables that the library
 * cannot import are named in the summary too. A missing folder, a folder without variable files and
 * a named variable without a file end the command whatever `--allow-failures` says.
 * @param { string } variableName name of the variable to import
 * @param {boolean} allowFailures true to report variables that could not be imported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportVariables(
  variableName?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'variable', allowFailures });
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

    const importData = { variable: {} as Record<string, VariableSkeleton> };
    for (const fileName of fileNames) {
      try {
        const variable = readJsonFile(
          `${variablesDir}/${fileName}`
        ) as VariableSkeleton;
        // valueBase64 will not be encoded by this point, so set value so it encodes on import
        variable.value = variable.valueBase64;
        importData.variable[variable._id] = variable;
      } catch (error) {
        // the file that the command line names is read whatever the flag says
        if (variableName) throw error;
        printError(error);
        run.recordFailure(fileName, causeOf(error));
      }
    }

    if (countItems(importData, 'variable') === 0) {
      // every file failed to read: the summary names them
      stopProgressIndicator(
        indicatorId,
        'No variable could be read, nothing is imported.',
        'fail'
      );
      return run.finish();
    }

    const { result: imported, error: importError } = await recordImportOfFile({
      run,
      itemCount: countItems(importData, 'variable'),
      fileName: variablesDir,
      importItems: () => importVariables(importData),
    });
    if (importError) {
      stopProgressIndicator(indicatorId, `Error importing variables`, 'fail');
      printError(importError);
      return run.finish();
    }

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

    if (imported.length !== fileNames.length) {
      const unchangedVariables = (await readVariables()).filter((remoteVar) =>
        imported.every((importedVar) => remoteVar._id !== importedVar._id)
      );
      unchanged += unchangedVariables.length;

      for (const v of unchangedVariables) {
        const status = v.loaded ? 'unchanged' : 'pending restart';
        printMessage(`Variable ${v._id} ${status}`);
      }
    }

    stopProgressIndicator(
      indicatorId,
      `${imported.length} variables imported.`,
      imported.length ? 'success' : 'warn'
    );

    if (updated > 0) {
      printMessage(
        `Changes made to variables: ${updated} updated, ${unchanged} unchanged`,
        'success'
      );
    } else {
      printMessage(
        `No changes, (${unchanged} variable(s) already up to date)`,
        'warn'
      );
    }
    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing variables`, 'fail');
    printError(error);
    if (run.hasFailures) run.finish();
    return false;
  }
}

/**
 * Delete variables from the tenant: the one with the given id, or all of them.
 * The variables are read once and deleted one by one, so that a variable that
 * cannot be deleted is reported and does not hide the others.
 * @param {string} name Optional exact variable id (`esv-...`). If omitted (undefined), targets all variables; an empty name names no variable: it is not found, and it never means "all".
 * @param {boolean} dryRun Show which variables would be deleted without deleting them.
 * @param {boolean} allowFailures True to succeed although some variables could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if a named variable does not exist (an empty name is one that does not), the variables cannot be read, or a variable cannot be deleted (unless failures are allowed for a deletion). Nothing to delete is a success when no variable was named.
 */
export async function configManagerDeleteVariables(
  name?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'variable', allowFailures });
  let variables: VariableSkeleton[];
  try {
    variables = await readVariables();
  } catch (error) {
    printError(error);
    return false;
  }
  const selectedVariables = variables.filter(
    (variable) => name === undefined || variable._id === name
  );
  if (selectedVariables.length === 0) {
    if (name !== undefined) {
      printMessage(`Variable '${name}' not found.`, 'error');
      return false;
    }
    printMessage('No variables found to delete.', 'warn');
    return true;
  }
  for (const variable of selectedVariables) {
    if (dryRun) {
      printMessage(`Dry run: Deleting variable: ${variable._id}`);
      continue;
    }
    try {
      await deleteVariable(variable._id);
      printMessage(`Deleted variable: ${variable._id}`);
      run.recordSuccess();
    } catch (error) {
      // the library's error names the variable, so no message of our own
      printError(error);
      run.recordFailure(variable._id, causeOf(error));
    }
  }
  return run.finish();
}
