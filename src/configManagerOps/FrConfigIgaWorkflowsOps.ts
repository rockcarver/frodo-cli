import fs from 'fs';
import path from 'path';
import { frodo, type ScriptTask } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { safeFileName } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { readWorkflows, updateWorkflow } = frodo.cloud.iga.workflow;

/**
 * Export IGA workflows in fr-config-manager format.
 * @param {string} name optional workflow name to filter by
 * @param {boolean} includeImmutable if true, also export immutable workflows
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportIgaWorkflows(
  name?: string,
  includeImmutable: boolean = false
): Promise<boolean> {
  try {
    const workflows = (await readWorkflows()).filter(
      (w) => (!name || w.name === name) && (includeImmutable || w.mutable)
    );
    if (name && workflows.length === 0) {
      throw new Error(`Workflow ${name} not found`);
    }
    for (const workflow of workflows) {
      const workflowPath = `iga/workflows/${workflow.name}`;

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
        getFilePath(`${workflowPath}/${workflow.name}.json`, true),
        false,
        true
      );
    }
    return true;
  } catch (error) {
    printError(error, 'Error exporting IGA workflows to files');
  }
  return false;
}

/**
 * Import IGA workflows in fr-config-manager format.
 * @param {string} name optional workflow name to filter by
 * @param {boolean} draft if true, will import workflow as draft
 * @returns {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportIgaWorkflows(
  name?: string,
  draft: boolean = false
): Promise<boolean> {
  try {
    const workflowsDir = `${getWorkingDirectory()}/iga/workflows`;
    const workflowDirs = fs
      .readdirSync(workflowsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((dirent) => `${workflowsDir}/${dirent.name}`);

    const status = draft ? 'draft' : 'published';
    let workflowFound = false;
    for (const workflowDir of workflowDirs) {
      const workflowName = path.parse(workflowDir).base;
      const workflowFile = path.join(workflowDir, `${workflowName}.json`);
      const workflow = readJsonFile(workflowFile) as any;
      if (name && name !== workflow.name) continue;
      workflowFound = true;
      if (!workflow.mutable) {
        printMessage(`Skipping immutable workflow ${workflow.name}`);
        continue;
      }
      const stepsDir = path.join(workflowDir, 'steps');
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
      workflow.status = status;
      await updateWorkflow(workflow.id, workflow);
    }
    if (!workflowFound) {
      printMessage(`Requested workflow ${name} not found`, 'error');
      return false;
    }
    return true;
  } catch (error) {
    printError(error, 'Error importing iga-workflows');
  }
  return false;
}
