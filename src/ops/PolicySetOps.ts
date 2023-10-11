import { frodo, state } from '@rockcarver/frodo-lib';
import { type PolicySkeleton } from '@rockcarver/frodo-lib/types/api/PoliciesApi';
import { type PolicySetSkeleton } from '@rockcarver/frodo-lib/types/api/PolicySetApi';
import {
  type PolicySetExportInterface,
  type PolicySetExportOptions,
  type PolicySetImportOptions,
} from '@rockcarver/frodo-lib/types/ops/PolicySetOps';
import fs from 'fs';

import {
  createObjectTable,
  createProgressBar,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressBar,
  succeedSpinner,
  updateProgressBar,
} from '../utils/Console';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';

const { getRealmName } = frodo.utils;
const { readPoliciesByPolicySet, deletePolicy } = frodo.authz.policy;
const {
  readPolicySets,
  readPolicySet,
  exportPolicySet,
  exportPolicySets,
  importPolicySet,
  importFirstPolicySet,
  importPolicySets,
} = frodo.authz.policySet;

/**
 * List policy sets
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listPolicySets(): Promise<boolean> {
  let outcome = false;
  try {
    const policySets = await readPolicySets();
    policySets.sort((a, b) => a.name.localeCompare(b.name));
    for (const policySet of policySets) {
      printMessage(`${policySet.name}`, 'data');
    }
    outcome = true;
  } catch (err) {
    printMessage(`listPolicySets ERROR: ${err.message}`, 'error');
    printMessage(err, 'error');
  }
  return outcome;
}

/**
 * Describe policy set
 * @param {string} policySetId policy set id/name
 * @param {Object} json JSON output
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describePolicySet(
  policySetId: string,
  json = false
): Promise<boolean> {
  let outcome = false;
  const policySet = await readPolicySet(policySetId);
  outcome = true;
  if (json) {
    printMessage(policySet, 'data');
  } else {
    const table = createObjectTable(policySet);
    printMessage(table.toString(), 'data');
  }
  return outcome;
}

/**
 * Delete policy set
 * @param {string} policySetId policy set id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicySet(policySetId: string): Promise<boolean> {
  debugMessage(`cli.PolicySetOps.deletePolicySet: begin`);
  showSpinner(`Deleting ${policySetId}...`);
  let outcome = false;
  const errors = [];
  const policies: PolicySkeleton[] = await readPoliciesByPolicySet(policySetId);
  for (const policy of policies) {
    try {
      debugMessage(`Deleting policy ${policy._id}`);
      await deletePolicy(policy._id);
    } catch (error) {
      error.message = `Error deleting policy ${policy._id} in policy set ${policySetId}: ${error}`;
      printMessage(error.message, 'error');
      errors.push(error);
    }
  }
  try {
    debugMessage(`Deleting policy set ${policySetId}`);
    await deletePolicySet(policySetId);
  } catch (error) {
    printMessage(`Error deleting policy set ${policySetId}: ${error}`, 'error');
  }
  if (errors.length) {
    const errorMessages = errors.map((error) => error.message).join('\n');
    failSpinner(`Error deleting ${policySetId}: ${errorMessages}`);
  } else {
    succeedSpinner(`Deleted ${policySetId}.`);
    outcome = true;
  }
  debugMessage(`cli.PolicySetOps.deletePolicySet: end [outcome=${outcome}]`);
  return outcome;
}

/**
 * Delete all policy sets
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicySets(): Promise<boolean> {
  debugMessage(`cli.PolicySetOps.deletePolicySets: begin`);
  let outcome = false;
  const errors = [];
  let policySets: PolicySetSkeleton[] = [];
  try {
    showSpinner(`Retrieving all policy sets...`);
    try {
      policySets = await readPolicySets();
      succeedSpinner(`Found ${policySets.length} policy sets.`);
    } catch (error) {
      error.message = `Error retrieving all policy sets: ${error.message}`;
      failSpinner(error.message);
      throw error;
    }
    if (policySets.length)
      createProgressBar(
        policySets.length,
        `Deleting ${policySets.length} policy sets...`
      );
    for (const policySet of policySets) {
      const policySetId = policySet.name;
      try {
        const policies: PolicySkeleton[] =
          await readPoliciesByPolicySet(policySetId);
        for (const policy of policies) {
          try {
            debugMessage(`Deleting policy ${policy._id}`);
            await deletePolicy(policy._id);
          } catch (error) {
            error.message = `Error deleting policy ${policy._id} in policy set ${policySetId}: ${error}`;
            printMessage(error.message, 'error');
            errors.push(error);
          }
        }
      } catch (error) {
        errors.push(error);
      }
      try {
        debugMessage(`Deleting policy set ${policySetId}`);
        await deletePolicySet(policySetId);
        updateProgressBar(`Deleted ${policySetId}`);
      } catch (error) {
        error.message = `Error deleting policy set ${policySetId}: ${error}`;
        updateProgressBar(error.message);
        errors.push(error);
      }
    }
  } catch (error) {
    error.message = `Error deleting policy sets: ${error}`;
    errors.push(error);
  } finally {
    if (errors.length) {
      const errorMessages = errors.map((error) => error.message).join('\n');
      if (policySets.length)
        stopProgressBar(`Error deleting all policy sets: ${errorMessages}`);
    } else {
      if (policySets.length)
        stopProgressBar(`Deleted ${policySets.length} policy sets.`);
      outcome = true;
    }
  }
  debugMessage(`cli.PolicySetOps.deletePolicySets: end [outcome=${outcome}]`);
  return outcome;
}

/**
 * Export policy set to file
 * @param {string} policySetId policy set id/name
 * @param {string} file file name
 * @param {PolicySetExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicySetToFile(
  policySetId: string,
  file: string,
  options: PolicySetExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicySetOps.exportPolicySetToFile: begin`);
  showSpinner(`Exporting ${policySetId}...`);
  try {
    let fileName = getTypedFilename(policySetId, 'policyset.authz');
    if (file) {
      fileName = file;
    }
    const exportData = await exportPolicySet(policySetId, options);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported ${policySetId} to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting ${policySetId}: ${error.message}`);
  }
  debugMessage(`cli.PolicySetOps.exportPolicySetToFile: end`);
  return outcome;
}

/**
 * Export policy sets to file
 * @param {string} file file name
 * @param {PolicySetExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicySetsToFile(
  file: string,
  options: PolicySetExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicySetOps.exportPolicySetsToFile: begin`);
  showSpinner(`Exporting all policy sets...`);
  try {
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}PolicySets`,
      'policyset.authz'
    );
    if (file) {
      fileName = file;
    }
    const exportData = await exportPolicySets(options);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported all policy sets to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting policy sets: ${error.message}`);
  }
  debugMessage(`cli.PolicySetOps.exportPolicySetsToFile: end`);
  return outcome;
}

/**
 * Export all policy sets to separate files
 * @param {PolicySetExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicySetsToFiles(
  options: PolicySetExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  debugMessage(`cli.PolicySetOps.exportPolicySetsToFiles: begin`);
  const errors = [];
  try {
    const policySets: PolicySetSkeleton[] = await readPolicySets();
    createProgressBar(policySets.length, 'Exporting policy sets...');
    for (const policySet of policySets) {
      const file = getTypedFilename(policySet.name, 'policyset.authz');
      try {
        const exportData: PolicySetExportInterface = await exportPolicySet(
          policySet.name,
          options
        );
        saveJsonToFile(exportData, file);
        updateProgressBar(`Exported ${policySet.name}.`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error exporting ${policySet.name}.`);
      }
    }
    stopProgressBar(`Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error exporting policy sets to files`);
  }
  debugMessage(`cli.PolicySetOps.exportPolicySetsToFiles: end`);
  return 0 === errors.length;
}

/**
 * Import policy set from file
 * @param {string} policySetId policy set id/name
 * @param {string} file file name
 * @param {PolicySetImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importPolicySetFromFile(
  policySetId: string,
  file: string,
  options: PolicySetImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicySetOps.importPolicySetFromFile: begin`);
  showSpinner(`Importing ${policySetId}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importPolicySet(policySetId, fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${policySetId}.`);
  } catch (error) {
    failSpinner(`Error importing ${policySetId}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicySetOps.importPolicySetFromFile: end`);
  return outcome;
}

/**
 * Import first policy set from file
 * @param {string} file file name
 * @param {PolicySetImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstPolicySetFromFile(
  file: string,
  options: PolicySetImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicySetOps.importFirstPolicySetFromFile: begin`);
  showSpinner(`Importing first policy set from ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    const policySet = await importFirstPolicySet(fileData, options);
    outcome = true;
    succeedSpinner(
      `Imported first policy set with name '${policySet.name}' from ${file}.`
    );
  } catch (error) {
    failSpinner(`Error importing first policy set from ${file}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicySetOps.importFirstPolicySetFromFile: end`);
  return outcome;
}

/**
 * Import policy sets from file
 * @param {string} file file name
 * @param {PolicySetImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importPolicySetsFromFile(
  file: string,
  options: PolicySetImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicySetOps.importPolicySetsFromFile: begin`);
  showSpinner(`Importing ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importPolicySets(fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${file}.`);
  } catch (error) {
    failSpinner(`Error importing ${file}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicySetOps.importPolicySetsFromFile: end`);
  return outcome;
}

/**
 * Import policy sets from files
 * @param {OAuth2ClientImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importPolicySetsFromFiles(
  options: PolicySetImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  const errors = [];
  try {
    debugMessage(`cli.PolicySetOps.importPolicySetsFromFiles: begin`);
    const names = fs.readdirSync('.');
    const files = names.filter((name) =>
      name.toLowerCase().endsWith('.policyset.authz.json')
    );
    createProgressBar(files.length, 'Importing policy sets...');
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: PolicySetExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.policyset).length;
        total += count;
        await importPolicySets(fileData, options);
        updateProgressBar(`Imported ${count} policy sets from ${file}`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error importing policy sets from ${file}`);
        printMessage(error, 'error');
      }
    }
    stopProgressBar(
      `Finished importing ${total} policy sets from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error importing policy sets from files.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicySetOps.importPolicySetsFromFiles: end`);
  return 0 === errors.length;
}
