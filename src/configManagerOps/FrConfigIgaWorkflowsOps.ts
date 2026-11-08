import fs from 'fs';
import path from 'path';
import { frodo, type ScriptTask } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { safeFileName } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { saveJsonToFile, getFilePath, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { readWorkflows, updateWorkflow } = frodo.cloud.iga.workflow;

/**
 * Export IGA workflows in fr-config-manager format.
 * @param {string} name optional workflow name to filter by
 * @param {boolean} includeImmutable if true, also export immutable workflows
 * @param {boolean} allowFailures true to succeed although some workflows could not be exported (the failures are still summarised)
 * @returns {Promise<boolean>} a promise that resolves to false if a named workflow does not exist, the workflows cannot be read, or a workflow cannot be exported (unless failures are allowed). No workflows when none was named is a success.
 */
export async function configManagerExportIgaWorkflows(
  name?: string,
  includeImmutable: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const workflows = (await readWorkflows()).filter(
      (w) => (!name || w.name === name) && (includeImmutable || w.mutable)
    );
    if (name && workflows.length === 0) {
      printMessage(`Workflow ${name} not found`, 'error');
      return false;
    }
    if (workflows.length === 0) {
      printMessage('No workflows found to export.');
      return true;
    }
    const run = new OperationRun({ unit: 'workflow', allowFailures });
    for (const workflow of workflows) {
      const workflowName = safeFileName(workflow.name);
      try {
        const workflowPath = `iga/workflows/${workflowName}`;

        const stepsPath = `${workflowPath}/steps`;
        workflow.steps.forEach((step) => {
          const uniqueId = safeFileName(`${step.displayName} - ${step.name}`);
          const stepPath = `${stepsPath}/${uniqueId}`;
          if (
            step.type === 'scriptTask' &&
            step.scriptTask &&
            (step.scriptTask as ScriptTask).script
          ) {
            const scriptFilename = `${uniqueId}.js`;
            extractFrConfigDataToFile(
              (step.scriptTask as ScriptTask).script,
              scriptFilename,
              stepPath
            );
            (step.scriptTask as any).script = {
              file: scriptFilename,
            };
          }
          saveJsonToFile(
            step,
            getFilePath(`${stepPath}/${uniqueId}.json`, true),
            false,
            true
          );
        });
        delete workflow.steps;

        saveJsonToFile(
          workflow,
          getFilePath(`${workflowPath}/${workflowName}.json`, true),
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
 * @returns {Promise<boolean>} a promise that resolves to false if the workflows folder or a named workflow does not exist, or a workflow cannot be read or imported (unless failures are allowed). No workflows when none was named is a success.
 */
export async function configManagerImportIgaWorkflows(
  name?: string,
  draft: boolean = false,
  allowFailures: boolean = false
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
        if (name && name !== workflow.name) continue;
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
              const filePath = path.join(
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
    if (name && !workflowFound) {
      printMessage(`Requested workflow ${name} not found`, 'error');
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
