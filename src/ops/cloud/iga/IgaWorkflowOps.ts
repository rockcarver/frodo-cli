import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import {
  ApprovalTask,
  ScriptTask,
  WorkflowExpression,
} from '@rockcarver/frodo-lib/types/api/cloud/iga/IgaWorkflowApi';
import {
  WorkflowExportInterface,
  WorkflowExportOptions,
  WorkflowGroup,
  WorkflowImportOptions,
} from '@rockcarver/frodo-lib/types/ops/cloud/iga/IgaWorkflowOps';
import fs from 'fs';
import c from 'tinyrainbow';

import { extractDataToFile, getExtractedData } from '../../../utils/Config';
import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  getTableRowsFromArray,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../../../utils/Console';
import * as EmailTemplate from '../../EmailTemplateOps';
import { isScriptExtracted } from '../../ScriptOps';
import { errorHandler } from '../../utils/OpsUtils';

const { getTypedFilename, saveJsonToFile, getFilePath, getWorkingDirectory } =
  frodo.utils;
const {
  publishWorkflow: _publishWorkflow,
  importWorkflows,
  readWorkflowGroups,
  exportWorkflow,
  exportWorkflows,
  deleteWorkflow: _deleteWorkflow,
  deleteWorkflows: _deleteWorkflows,
} = frodo.cloud.iga.workflow;
/**
 * List all the workflows
 * @param {boolean} long Long version, all the fields
 * @returns {Promise<boolean>} a promise resolving to true if successful, false otherwise
 */
export async function listWorkflows(long: boolean = false): Promise<boolean> {
  let workflows: WorkflowGroup[] = [];
  try {
    workflows = await readWorkflowGroups();
    if (!long) {
      for (const workflow of workflows) {
        printMessage(
          `${workflow.published ? workflow.published.id : workflow.draft.id}`,
          'data'
        );
      }
      return true;
    }
    const table = createTable([
      'ID',
      'Name',
      'Drafted',
      'Published',
      'Mutable',
    ]);
    for (const workflowGroup of workflows) {
      const workflow = workflowGroup.published ?? workflowGroup.draft;
      table.push([
        `${workflow.id}`,
        workflow.name,
        workflowGroup.draft ? c.greenBright('true') : c.redBright('false'),
        workflowGroup.published ? c.greenBright('true') : c.redBright('false'),
        workflow.mutable ? c.greenBright('true') : c.redBright('false'),
      ]);
    }
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Describe a workflow
 * @param {string} workflowId workflow id
 * @param {string} file the workflow export file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeWorkflow(
  workflowId?: string,
  file?: string
): Promise<boolean> {
  try {
    const workflowExport = file
      ? getWorkflowExportFromFile(getFilePath(file))
      : await exportWorkflow(workflowId, {
          deps: true,
          useStringArrays: false,
          coords: true,
          includeReadOnly: true,
        });
    if (!workflowId) {
      const ids = Object.keys(workflowExport.workflow);
      if (ids.length === 0)
        throw new FrodoError(`No workflows found in export file ${file}`);
      workflowId = ids[0];
    }
    // Workflow Details
    for (const workflow of [
      workflowExport.workflow[workflowId].draft,
      workflowExport.workflow[workflowId].published,
    ].filter((w) => w)) {
      printMessage(
        `${workflow.status.charAt(0).toUpperCase() + workflow.status.slice(1)} Workflow`,
        'data'
      );
      const table = createKeyValueTable();
      table.push([c.cyanBright('Id'), workflow.id]);
      table.push([c.cyanBright('Name'), workflow.name]);
      table.push([c.cyanBright('Display Name'), workflow.displayName]);
      table.push([c.cyanBright('Description'), workflow.description]);
      if (workflow.type) table.push([c.cyanBright('Type'), workflow.type]);
      table.push([c.cyanBright('Status'), workflow.status]);
      table.push([
        c.cyanBright('Mutable'),
        workflow.mutable ? c.greenBright('true') : c.redBright('false'),
      ]);
      table.push([
        c.cyanBright('ChildType'),
        workflow.childType ? c.greenBright('true') : c.redBright('false'),
      ]);
      getTableRowsFromArray(
        table,
        `Steps (${workflow.steps.length})`,
        workflow.steps.map((s) => s.name)
      );
      printMessage(table.toString() + '\n', 'data');
    }
    // Email Templates
    if (Object.entries(workflowExport.emailTemplate).length) {
      printMessage(
        `\nEmail Templates (${
          Object.entries(workflowExport.emailTemplate).length
        }):`,
        'data'
      );
      for (const templateData of Object.values(workflowExport.emailTemplate)) {
        printMessage(
          `- ${EmailTemplate.getOneLineDescription(templateData)}`,
          'data'
        );
      }
    }
    // Events
    if (Object.entries(workflowExport.event).length) {
      printMessage(
        `\nEvents (${Object.entries(workflowExport.event).length}):`,
        'data'
      );
      for (const eventData of Object.values(workflowExport.event)) {
        printMessage(`- [${eventData.id}] ${eventData.name}`, 'data');
      }
    }
    // Request Forms
    if (Object.entries(workflowExport.requestForm).length) {
      printMessage(
        `\nRequest Forms (${
          Object.entries(workflowExport.requestForm).length
        }):`,
        'data'
      );
      for (const formData of Object.values(workflowExport.requestForm)) {
        printMessage(`- [${formData.id}] ${formData.name}`, 'data');
      }
    }
    // Request Types
    if (Object.entries(workflowExport.requestType).length) {
      printMessage(
        `\nRequest Types (${
          Object.entries(workflowExport.requestType).length
        }):`,
        'data'
      );
      for (const typeData of Object.values(workflowExport.requestType)) {
        printMessage(`- [${typeData.id}] ${typeData.displayName}`, 'data');
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export workflow to file
 * @param {string} workflowId workflow id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {boolean} extract extracts the scripts from the export into separate files if true. Default: false
 * @param {WorkflowExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportWorkflowToFile(
  workflowId: string,
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  extract: boolean = false,
  options: WorkflowExportOptions = {
    deps: true,
    useStringArrays: true,
    coords: true,
    includeReadOnly: false,
  }
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${workflowId}...`
  );
  try {
    const exportData = await exportWorkflow(workflowId, options);
    if (!file) {
      file = getTypedFilename(workflowId, 'workflow');
    }
    const filePath = getFilePath(file, true);
    if (extract) extractWorkflowScriptsToFiles(exportData);
    updateProgressIndicator(
      indicatorId,
      `Saving ${workflowId} to ${filePath}...`
    );
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
    stopProgressIndicator(
      indicatorId,
      `Exported workflow ${workflowId} to file`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting workflow ${workflowId} to file`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all workflows to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {WorkflowExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportWorkflowsToFile(
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: WorkflowExportOptions = {
    deps: true,
    useStringArrays: true,
    coords: true,
    includeReadOnly: false,
  }
): Promise<boolean> {
  try {
    const exportData = await exportWorkflows(options, errorHandler);
    if (!file) {
      file = getTypedFilename(`allWorkflows`, 'workflow');
    }
    saveJsonToFile(
      exportData,
      getFilePath(file, true),
      includeMeta,
      false,
      keepModifiedProperties
    );
    return true;
  } catch (error) {
    printError(error, `Error exporting workflows to file`);
  }
  return false;
}

/**
 * Export all workflows to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {boolean} extract extracts the scripts from the exports into separate files if true. Default: false
 * @param {WorkflowExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportWorkflowsToFiles(
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  extract: boolean = false,
  options: WorkflowExportOptions = {
    deps: true,
    useStringArrays: true,
    coords: true,
    includeReadOnly: false,
  }
): Promise<boolean> {
  try {
    // We use the result callback here in order to ensure each saved file contains it's respective dependencies in the event options.deps is true
    await exportWorkflows(options, (e, workflowExport) => {
      if (e) {
        errorHandler(e);
      } else {
        if (extract) extractWorkflowScriptsToFiles(workflowExport);
        saveJsonToFile(
          workflowExport,
          getFilePath(
            getTypedFilename(
              Object.keys(workflowExport.workflow)[0],
              'workflow'
            ),
            true
          ),
          includeMeta,
          false,
          keepModifiedProperties
        );
      }
    });
    return true;
  } catch (error) {
    printError(error, `Error exporting workflows to files`);
  }
  return false;
}

/**
 * Import a workflow from file
 * @param {string} workflowId workflow id
 * @param {string} file import file name
 * @param {WorkflowImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWorkflowFromFile(
  workflowId: string,
  file: string,
  options: WorkflowImportOptions = {
    deps: true,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing workflow...'
    );
    const importData = getWorkflowExportFromFile(getFilePath(file));
    updateProgressIndicator(indicatorId, 'Importing workflow...');
    await importWorkflows(workflowId, importData, options);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported workflow ${workflowId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing workflow ${workflowId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Import workflows from file
 * @param {String} file file name
 * @param {WorkflowImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWorkflowsFromFile(
  file: string,
  options: WorkflowImportOptions = {
    deps: true,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing workflows...'
    );
    const importData = getWorkflowExportFromFile(getFilePath(file));
    updateProgressIndicator(indicatorId, 'Importing workflows...');
    await importWorkflows(undefined, importData, options, errorHandler);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported workflow(s) from file ${file}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing workflow(s).`, 'fail');
    printError(error, `Error importing workflow(s) from file ${file}`);
  }
  return false;
}

/**
 * Import all workflows from separate files
 * @param {WorkflowImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importWorkflowsFromFiles(
  options: WorkflowImportOptions = {
    deps: true,
  }
): Promise<boolean> {
  let indicatorId: string;
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const workflowFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.workflow.json')
    );
    indicatorId = createProgressIndicator(
      'determinate',
      workflowFiles.length,
      'Importing workflows...'
    );
    for (const file of workflowFiles) {
      try {
        updateProgressIndicator(
          indicatorId,
          `Importing workflows from file ${file}...`
        );
        await importWorkflowsFromFile(file, options);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing workflows from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`One or more errors importing workflows`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Successfully imported workflows.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error(s) importing workflows.`, 'fail');
    printError(error, `Error importing workflows from files`);
  }
  return false;
}

/**
 * Import first workflow from file
 * @param {string} file import file name
 * @param {WorkflowImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstWorkflowFromFile(
  file: string,
  options: WorkflowImportOptions = {
    deps: true,
  }
): Promise<boolean> {
  let indicatorId: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      'Importing workflow...'
    );
    const importData = getWorkflowExportFromFile(getFilePath(file));
    const ids = Object.keys(importData.workflow);
    if (ids.length === 0)
      throw new FrodoError(`No workflows found in import data`);
    await importWorkflows(ids[0], importData, options);
    stopProgressIndicator(
      indicatorId,
      `Imported workflow from ${file}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing workflow from ${file}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete workflow. If both deleteDraft and deletePublished are truthy or falsy, attempt to delete both, otherwise deletes only one of them.
 * @param {string} workflowId workflow id
 * @param {boolean} deleteDraft true to delete only the draft workflow, false otherwise
 * @param {boolean} deletePublished true to delete only the published workflow, false otherwise
 * @param {boolean} force true to forcefully delete the workflow, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteWorkflow(
  workflowId: string,
  deleteDraft?: boolean,
  deletePublished?: boolean,
  force?: boolean
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting workflow ${workflowId}...`
  );
  try {
    const result = await _deleteWorkflow(
      workflowId,
      deleteDraft || !deletePublished,
      deletePublished || !deleteDraft,
      { force },
      errorHandler
    );
    if (!result.draft && !result.published) {
      throw new FrodoError(`Failed to delete workflow ${workflowId}`);
    }
    stopProgressIndicator(
      spinnerId,
      `Deleted workflow ${workflowId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Delete workflows. If both deleteDraft and deletePublished are truthy or falsy, attempt to delete all of both types, otherwise deletes only those of one type.
 * @param {boolean} deleteDraft true to delete only the draft workflows, false otherwise
 * @param {boolean} deletePublished true to delete only the published workflows, false otherwise
 * @param {boolean} force true to forcefully delete the workflow, false otherwise
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteWorkflows(
  deleteDraft?: boolean,
  deletePublished?: boolean,
  force?: boolean
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Deleting workflows...`
  );
  try {
    await _deleteWorkflows(
      deleteDraft || !deletePublished,
      deletePublished || !deleteDraft,
      { force },
      errorHandler
    );
    stopProgressIndicator(spinnerId, `Deleted workflows.`, 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 *
 * @param {string} workflowId workflow id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function publishWorkflow(workflowId: string): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    undefined,
    `Publishing workflow ${workflowId}...`
  );
  try {
    await _publishWorkflow(workflowId);
    stopProgressIndicator(
      spinnerId,
      `Published workflow ${workflowId}.`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error: ${error.message}`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Get a workflow export from json file.
 *
 * @param file The path to the workflow export file
 * @returns The workflow export
 */
export function getWorkflowExportFromFile(
  file: string
): WorkflowExportInterface {
  const exportData = JSON.parse(
    fs.readFileSync(file, 'utf8')
  ) as WorkflowExportInterface;
  for (const workflowGroup of Object.values(exportData.workflow)) {
    for (const workflow of [
      workflowGroup.draft,
      workflowGroup.published,
    ].filter((w) => w)) {
      for (const step of workflow.steps) {
        switch (step.type) {
          case 'approvalTask':
          case 'fulfillmentTask':
          case 'violationTask': {
            const actors = (step[step.type] as ApprovalTask)?.actors;
            if (
              !actors ||
              Array.isArray(actors) ||
              !actors.isExpression ||
              !isScriptExtracted(actors.value)
            )
              continue;
            const scriptRaw = getExtractedData(
              actors.value as string,
              file.substring(0, file.lastIndexOf('/'))
            );
            actors.value = scriptRaw;
            const uiConfigActors =
              workflow.staticNodes?.uiConfig?.[step.name]?.actors;
            if (
              !uiConfigActors ||
              Array.isArray(uiConfigActors) ||
              !uiConfigActors.isExpression ||
              !isScriptExtracted(uiConfigActors.value)
            )
              continue;
            uiConfigActors.value = scriptRaw;
            continue;
          }
          case 'scriptTask': {
            const scriptTask = step[step.type] as ScriptTask;
            if (!isScriptExtracted(scriptTask.script)) continue;
            const scriptRaw = getExtractedData(
              scriptTask.script as string,
              file.substring(0, file.lastIndexOf('/'))
            );
            scriptTask.script = scriptRaw;
            continue;
          }
          default:
            continue;
        }
      }
    }
  }
  return exportData;
}

/**
 * Extracts scripts from a workflow export into separate files.
 * @param {WorkflowExportInterface} exportData The workflow export
 * @param {string} workflowId The workflow id to extract a specific script from. If undefined, will extract scripts from all workflows.
 * @param {string} directory The directory within the base directory to save the script files
 * @returns {boolean} true if successful, false otherwise
 */
export function extractWorkflowScriptsToFiles(
  exportData: WorkflowExportInterface,
  workflowId?: string,
  directory?: string
): boolean {
  try {
    const workflows = workflowId
      ? [exportData.workflow[workflowId]]
      : Object.values(exportData.workflow);
    for (const workflowGroup of workflows) {
      for (const workflow of [
        workflowGroup.draft,
        workflowGroup.published,
      ].filter((w) => w)) {
        for (const step of workflow.steps) {
          switch (step.type) {
            case 'approvalTask':
            case 'fulfillmentTask':
            case 'violationTask': {
              const actors = (step[step.type] as ApprovalTask)?.actors;
              if (!actors || Array.isArray(actors) || !actors.isExpression)
                continue;
              const scriptText = Array.isArray(actors.value)
                ? actors.value.join('\n')
                : actors.value;
              const scriptFileName = getTypedFilename(
                step.name,
                'workflow',
                'js'
              );
              const extractedFile = extractDataToFile(
                scriptText,
                `${workflow.id}/${workflow.status}/${scriptFileName}`,
                directory
              );
              (
                (step[step.type] as ApprovalTask).actors as WorkflowExpression
              ).value = extractedFile;
              const uiConfigActors =
                workflow.staticNodes?.uiConfig?.[step.name]?.actors;
              if (
                !uiConfigActors ||
                Array.isArray(uiConfigActors) ||
                !uiConfigActors.isExpression
              )
                continue;
              (uiConfigActors as WorkflowExpression).value = extractedFile;
              continue;
            }
            case 'scriptTask': {
              const script = (step[step.type] as ScriptTask).script;
              const scriptText = Array.isArray(script)
                ? script.join('\n')
                : script;
              const scriptFileName = getTypedFilename(
                step.name,
                'workflow',
                (step[step.type] as ScriptTask).language === 'javascript'
                  ? 'js'
                  : 'unknown'
              );
              (step[step.type] as ScriptTask).script = extractDataToFile(
                scriptText,
                `${workflow.id}/${workflow.status}/${scriptFileName}`,
                directory
              );
              continue;
            }
            default:
              continue;
          }
        }
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
