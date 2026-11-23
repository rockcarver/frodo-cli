import fs from 'fs';
import path from 'path';
import { frodo, type ScriptTask } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import {
  encodedName,
  pulledFilePath,
  PulledPaths,
  referencedFilePath,
} from '../utils/ConfigTreePath';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

const { saveJsonToFile, getFilePath, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { readWorkflows, updateWorkflow } = frodo.cloud.iga.workflow;

/**
 * Export IGA workflows in fr-config-manager format.
 * @param {string} name optional workflow name to filter by
 * @param {boolean} includeImmutable if true, also export immutable workflows
 * @param {boolean} allowFailures true to succeed although some workflows could not be exported (the failures are still summarised)
 * @param {string} id optional workflow id (the `id` of the workflow) to filter by. An empty id selects nothing, so it is not found (the command refuses an empty value before it connects).
 * @returns {Promise<boolean>} a promise that resolves to false if a named workflow (by name or by id) does not exist, the workflows cannot be read, or a workflow cannot be exported (unless failures are allowed). No workflows when none was named is a success.
 */
export async function configManagerExportIgaWorkflows(
  name?: string,
  includeImmutable: boolean = false,
  allowFailures: boolean = false,
  id?: string
): Promise<boolean> {
  try {
    const workflows = (await readWorkflows()).filter(
      (w) =>
        (id !== undefined ? w.id === id : !name || w.name === name) &&
        (includeImmutable || w.mutable)
    );
    if ((id !== undefined || name) && workflows.length === 0) {
      printMessage(
        id !== undefined
          ? `Workflow with id ${id} not found`
          : `Workflow ${name} not found`,
        'error'
      );
      return false;
    }
    if (workflows.length === 0) {
      printMessage('No workflows found to export.');
      return true;
    }
    const run = new OperationRun({ unit: 'workflow', allowFailures });
    const pulledPaths = new PulledPaths();
    for (const workflow of workflows) {
      try {
        // the tenant names the workflow and its steps: each is one name here, never a path
        const workflowName = encodedName(workflow.name);
        const workflowPath = `iga/workflows/${workflowName}`;
        const uniqueIds = workflow.steps.map((step) =>
          encodedName(`${step.displayName} - ${step.name}`)
        );
        // every file is checked before the first one is written
        const ownerOfStep = (index: number) =>
          `${workflow.name}/${workflow.steps[index].displayName} - ${workflow.steps[index].name}`;
        pulledPaths.owner = workflow.name;
        pulledFilePath(`${workflowPath}/${workflowName}.json`, pulledPaths);
        for (const [index, uniqueId] of uniqueIds.entries()) {
          pulledPaths.owner = ownerOfStep(index);
          pulledFilePath(
            `${workflowPath}/steps/${uniqueId}/${uniqueId}.json`,
            pulledPaths
          );
        }

        const stepsPath = `${workflowPath}/steps`;
        workflow.steps.forEach((step, index) => {
          const uniqueId = uniqueIds[index];
          const stepPath = `${stepsPath}/${uniqueId}`;
          pulledPaths.owner = ownerOfStep(index);
          if (
            step.type === 'scriptTask' &&
            step.scriptTask &&
            (step.scriptTask as ScriptTask).script
          ) {
            const scriptFilename = `${uniqueId}.js`;
            extractFrConfigDataToFile(
              (step.scriptTask as ScriptTask).script,
              scriptFilename,
              stepPath,
              pulledPaths
            );
            (step.scriptTask as any).script = {
              file: scriptFilename,
            };
          }
          saveJsonToFile(
            step,
            getFilePath(
              pulledFilePath(`${stepPath}/${uniqueId}.json`, pulledPaths),
              true
            ),
            false,
            true
          );
        });
        delete workflow.steps;

        pulledPaths.owner = workflow.name;
        saveJsonToFile(
          workflow,
          getFilePath(
            pulledFilePath(`${workflowPath}/${workflowName}.json`, pulledPaths),
            true
          ),
          false,
          true
        );
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting workflow ${workflow.name}`);
        run.recordFailure(workflow.name, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error exporting IGA workflows to files');
  }
  return false;
}

/**
 * Import IGA workflows in fr-config-manager format.
 * @param {string} name optional workflow name to filter by
 * @param {boolean} draft if true, will import workflow as draft
 * @param {boolean} allowFailures true to succeed although some workflows could not be imported (the failures are still summarised)
 * @param {string} id optional workflow id (the `id` of the workflow file) to filter by instead of a name. An empty id selects nothing, so it is not found (the command refuses an empty value before it connects).
 * @returns {Promise<boolean>} a promise that resolves to false if the workflows folder or a named workflow (by name or by id) does not exist, or a workflow cannot be read or imported (unless failures are allowed). No workflows when none was named is a success.
 */
export async function configManagerImportIgaWorkflows(
  name?: string,
  draft: boolean = false,
  allowFailures: boolean = false,
  id?: string
): Promise<boolean> {
  try {
    const workflowsDir = `${getWorkingDirectory()}/iga/workflows`;
    if (!fs.existsSync(workflowsDir)) {
      printMessage(`IGA workflows folder not found: ${workflowsDir}`, 'error');
      return false;
    }
    const workflowDirs = fs
      .readdirSync(workflowsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((dirent) => `${workflowsDir}/${dirent.name}`);

    const status = draft ? 'draft' : 'published';
    const run = new OperationRun({ unit: 'workflow', allowFailures });
    let workflowFound = false;
    for (const workflowDir of workflowDirs) {
      const workflowName = path.parse(workflowDir).base;
      try {
        const workflowFile = path.join(workflowDir, `${workflowName}.json`);
        const workflow = readJsonFile(workflowFile) as any;
        if (
          id !== undefined ? workflow.id !== id : name && name !== workflow.name
        )
          continue;
        workflowFound = true;
        if (!workflow.mutable) {
          printMessage(`Skipping immutable workflow ${workflow.name}`);
          continue;
        }
        const stepsDir = path.join(workflowDir, 'steps');
        // A workflow without steps has no steps directory: import it as it is
        if (fs.existsSync(stepsDir)) {
          const stepDirs = fs
            .readdirSync(stepsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((dirent) => path.join(stepsDir, dirent.name));
          const steps = [];
          for (const stepDir of stepDirs) {
            const stepName = path.parse(stepDir).base;
            const stepFile = path.join(stepDir, `${stepName}.json`);
            const step = readJsonFile(stepFile) as any;
            if (
              step.type === 'scriptTask' &&
              step.scriptTask &&
              (step.scriptTask as ScriptTask).script &&
              (step.scriptTask as any).script.file
            ) {
              const filePath = referencedFilePath(
                stepDir,
                (step.scriptTask as any).script.file
              );
              if (fs.existsSync(filePath)) {
                (step.scriptTask as ScriptTask).script = fs.readFileSync(
                  filePath,
                  'utf8'
                );
              }
            }
            steps.push(step);
          }
          workflow.steps = steps;
        }
        workflow.status = status;
        await updateWorkflow(workflow.id, workflow);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error importing workflow ${workflowName}`);
        run.recordFailure(workflowName, causeOf(error));
      }
    }
    if ((id !== undefined || name) && !workflowFound) {
      printMessage(
        id !== undefined
          ? `Requested workflow with id ${id} not found`
          : `Requested workflow ${name} not found`,
        'error'
      );
      return false;
    }
    if (workflowDirs.length === 0) {
      printMessage(`No workflows found to import in ${workflowsDir}`);
      return true;
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error importing iga-workflows');
  }
  return false;
}
