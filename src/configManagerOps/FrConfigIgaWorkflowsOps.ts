import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';
import path from 'path';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { safeFileName } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath } = frodo.utils;
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
    workflows.forEach(processIgaWorkflowForExport);
    return true;
  } catch (error) {
    printError(error, 'Error exporting iga-workflows to files');
  }
  return false;
}
/**
 * Export a single IGA workflow to files in fr-config-manager format.
 * @param {object} workflow the workflow to export
 */
async function processIgaWorkflowForExport(workflow) {
  try {
    const workflowName = safeFileName(workflow.name);
    const workflowPath = `iga/workflows/${workflowName}`;
    const stepsPath = `${workflowPath}/steps`;
    workflow.steps.forEach((step) => {
      const uniqueId = safeFileName(`${step.displayName} - ${step.name}`);
      const stepPath = `${stepsPath}/${uniqueId}`;
      const stepBody = step[step.type];
      if (
        stepBody &&
        typeof stepBody === 'object' &&
        typeof stepBody.script === 'string' &&
        stepBody.script
      ) {
        const scriptFilename = `${uniqueId}.js`;
        extractFrConfigDataToFile(stepBody.script, scriptFilename, stepPath);
        stepBody.script = {
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
  } catch (err) {
    printError(err);
  }
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
    const workflowsPath = getFilePath('iga/workflows');
    let workflowDirs = [];

    if (name) {
      const workflowDir = `${workflowsPath}/${name}`;
      if (!fs.existsSync(workflowDir)) {
        printMessage(`Requested workflow ${name} not found`, 'error');
        return false;
      }
      workflowDirs = [workflowDir];
    } else {
      workflowDirs = fs
        .readdirSync(workflowsPath)
        .map((dirName) => `${workflowsPath}/${dirName}`);
    }

    const status = draft ? 'draft' : 'published';
    for (const workflowDir of workflowDirs) {
      const workflow = processWorkflowForImport(workflowDir);

      if (!workflow.mutable) {
        verboseMessage(`Skipping immutable workflow ${workflow.name}`);
        continue;
      }

      workflow.status = status;
      await updateWorkflow(workflow.id, workflow);
    }
    return true;
  } catch (error) {
    printError(error, 'Error importing iga-workflows');
  }
  return false;
}

/**
 * Process a workflow to import in fr-config-manager format
 * @param {string} workflowDir path to the workflow directory
 * @returns {object} the assembled workflow object
 */
function processWorkflowForImport(workflowDir: string) {
  try {
    const workflowName = path.parse(workflowDir).base;
    const workflowFile = path.join(workflowDir, `${workflowName}.json`);
    const workflow = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));

    const stepsDir = path.join(workflowDir, 'steps');
    if (!fs.existsSync(stepsDir)) return workflow;
    const stepDirs = fs
      .readdirSync(stepsDir, { withFileTypes: true })
      .map((dirent) => path.join(stepsDir, dirent.name));
    const steps = [];
    for (const stepDir of stepDirs) {
      const stepName = path.parse(stepDir).base;
      const stepFile = path.join(stepDir, `${stepName}.json`);
      const step = JSON.parse(fs.readFileSync(stepFile, 'utf8'));
      const stepBody = step?.[step?.type];
      if (
        stepBody &&
        typeof stepBody === 'object' &&
        stepBody.script &&
        typeof stepBody.script === 'object' &&
        typeof stepBody.script.file === 'string'
      ) {
        const filePath = path.join(stepDir, stepBody.script.file);
        if (fs.existsSync(filePath)) {
          stepBody.script = fs.readFileSync(filePath, 'utf8');
        }
      }
      steps.push(step);
    }
    workflow.steps = steps;

    return workflow;
  } catch (error) {
    printError(error, 'Error importing iga-workflows');
  }
}
