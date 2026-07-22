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
