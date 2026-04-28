import { frodo } from '@rockcarver/frodo-lib';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';
import { safeFileName } from '../utils/FrConfig';

const { saveJsonToFile, getFilePath } = frodo.utils;
const { readWorkflows } = frodo.cloud.iga.workflow;

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
    let workflows = await readWorkflows();
    if (name) {
      workflows = workflows.filter((workflow) => workflow.name === name);
    }
    if (!includeImmutable) {
      workflows = workflows.filter((workflow) => workflow.mutable);
    }
    workflows.forEach((workflow) => {
      processIgaWorkflow(workflow, 'iga/workflows');
    });
    return true;
  } catch (error) {
    printError(error, 'Error exporting iga-workflows to files');
  }
  return false;
}

async function processIgaWorkflow(workflow, fileDir) {
  try {
    const workflowName = safeFileName(workflow.name);
    const workflowPath = `${fileDir}/${workflowName}`;
    if (Array.isArray(workflow.steps)) {
      const stepsPath = `${workflowPath}/steps`;
      workflow.steps.forEach((step) => {
        const uniqueId = safeFileName(`${step.displayName} - ${step.name}`);
        const stepPath = `${stepsPath}/${uniqueId}`;
        const stepBody = step[step.type];
        if (
          stepBody &&
          typeof stepBody === 'object' &&
          typeof stepBody.script === 'string' &&
          stepBody.script.length > 0
        ) {
          const scriptFilename = `${uniqueId}.js`;
          extractFrConfigDataToFile(stepBody.script, scriptFilename, stepPath);
          stepBody.script = {
            file: scriptFilename,
          };
        }
        const stepFileName = `${stepPath}/${uniqueId}.json`;
        saveJsonToFile(step, getFilePath(stepFileName, true), false, true);
      });
      delete workflow.steps;
    }
    const fileName = `${workflowPath}/${workflowName}.json`;
    saveJsonToFile(workflow, getFilePath(fileName, true), false, true);
  } catch (err) {
    printError(err);
  }
}
