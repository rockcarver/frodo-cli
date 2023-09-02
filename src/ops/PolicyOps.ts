import { frodo, state } from '@rockcarver/frodo-lib';
import { type PolicySkeleton } from '@rockcarver/frodo-lib/types/api/PoliciesApi';
import type {
  PolicyExportInterface,
  PolicyExportOptions,
  PolicyImportOptions,
} from '@rockcarver/frodo-lib/types/ops/PolicyOps';
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
const {
  readPolicies,
  readPoliciesByPolicySet,
  readPolicy,
  exportPolicy,
  exportPolicies,
  exportPoliciesByPolicySet,
  importPolicy,
  importFirstPolicy,
  importPolicies,
} = frodo.authz.policy;

/**
 * List policies
 * @param {boolean} long list with details
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listPolicies(long = false): Promise<boolean> {
  let outcome = false;
  try {
    const policies = await readPolicies();
    policies.sort((a, b) => a._id.localeCompare(b._id));
    for (const policy of policies) {
      if (!long) {
        printMessage(`${policy._id}`, 'data');
      }
    }
    outcome = true;
  } catch (err) {
    printMessage(`listPolicies ERROR: ${err.message}`, 'error');
    printMessage(err, 'error');
  }
  return outcome;
}

/**
 * List policies by policy set
 * @param {string} policySetId policy set id/name
 * @param {boolean} long list with details
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listPoliciesByPolicySet(
  policySetId: string,
  long = false
): Promise<boolean> {
  let outcome = false;
  try {
    const policies = await readPoliciesByPolicySet(policySetId);
    policies.sort((a, b) => a._id.localeCompare(b._id));
    for (const policy of policies) {
      if (!long) {
        printMessage(`${policy._id}`, 'data');
      }
    }
    outcome = true;
  } catch (err) {
    printMessage(`listPolicies ERROR: ${err.message}`, 'error');
    printMessage(err, 'error');
  }
  return outcome;
}

/**
 * Describe policy
 * @param {string} policyId policy id/name
 * @param {Object} json JSON output
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describePolicy(
  policyId: string,
  json = false
): Promise<boolean> {
  let outcome = false;
  const policySet = await readPolicy(policyId);
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
 * Delete policy
 * @param {string} policyId policy id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicy(policyId: string): Promise<boolean> {
  debugMessage(`cli.PolicyOps.deletePolicy: begin`);
  showSpinner(`Deleting ${policyId}...`);
  let outcome = false;
  const errors = [];
  try {
    debugMessage(`Deleting policy ${policyId}`);
    await deletePolicy(policyId);
  } catch (error) {
    printMessage(`Error deleting policy ${policyId}: ${error}`, 'error');
  }
  if (errors.length) {
    const errorMessages = errors.map((error) => error.message).join('\n');
    failSpinner(`Error deleting ${policyId}: ${errorMessages}`);
  } else {
    succeedSpinner(`Deleted ${policyId}.`);
    outcome = true;
  }
  debugMessage(`cli.PolicyOps.deletePolicy: end [outcome=${outcome}]`);
  return outcome;
}

/**
 * Delete all policies
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicies(): Promise<boolean> {
  debugMessage(`cli.PolicyOps.deletePolicies: begin`);
  let outcome = false;
  const errors = [];
  let policies: PolicySkeleton[] = [];
  try {
    showSpinner(`Retrieving all policies...`);
    try {
      policies = await readPolicies();
      succeedSpinner(`Found ${policies.length} policies.`);
    } catch (error) {
      error.message = `Error retrieving all policies: ${error.message}`;
      failSpinner(error.message);
      throw error;
    }
    if (policies.length)
      createProgressBar(
        policies.length,
        `Deleting ${policies.length} policies...`
      );
    for (const policy of policies) {
      const policyId = policy._id;
      try {
        debugMessage(`Deleting policy ${policyId}`);
        await deletePolicy(policyId);
        updateProgressBar(`Deleted ${policyId}`);
      } catch (error) {
        error.message = `Error deleting policy ${policyId}: ${error}`;
        updateProgressBar(error.message);
        errors.push(error);
      }
    }
  } catch (error) {
    error.message = `Error deleting policies: ${error}`;
    errors.push(error);
  } finally {
    if (errors.length) {
      const errorMessages = errors.map((error) => error.message).join('\n');
      if (policies.length)
        stopProgressBar(`Error deleting all policies: ${errorMessages}`);
    } else {
      if (policies.length)
        stopProgressBar(`Deleted ${policies.length} policies.`);
      outcome = true;
    }
  }
  debugMessage(`cli.PolicyOps.deletePolicies: end [outcome=${outcome}]`);
  return outcome;
}

/**
 * Delete all policies in policy set
 * @param {string} policySetId policy set id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePoliciesByPolicySet(
  policySetId: string
): Promise<boolean> {
  debugMessage(`cli.PolicyOps.deletePoliciesByPolicySet: begin`);
  let outcome = false;
  const errors = [];
  let policies: PolicySkeleton[] = [];
  try {
    showSpinner(`Retrieving all policies from policy set ${policySetId}...`);
    try {
      policies = await readPoliciesByPolicySet(policySetId);
      succeedSpinner(
        `Found ${policies.length} policies in policy set ${policySetId}.`
      );
    } catch (error) {
      error.message = `Error retrieving all policies from policy set ${policySetId}: ${error.message}`;
      failSpinner(error.message);
      throw error;
    }
    if (policies.length)
      createProgressBar(
        policies.length,
        `Deleting ${policies.length} policies from policy set ${policySetId}...`
      );
    for (const policy of policies) {
      const policyId = policy._id;
      try {
        debugMessage(`Deleting policy ${policyId}`);
        await deletePolicy(policyId);
        updateProgressBar(`Deleted ${policyId}`);
      } catch (error) {
        error.message = `Error deleting policy ${policyId} from policy set ${policySetId}: ${error}`;
        updateProgressBar(error.message);
        errors.push(error);
      }
    }
  } catch (error) {
    error.message = `Error deleting policies from policy set ${policySetId}: ${error}`;
    errors.push(error);
  } finally {
    if (errors.length) {
      const errorMessages = errors.map((error) => error.message).join('\n');
      if (policies.length)
        stopProgressBar(
          `Error deleting all policies from policy set ${policySetId}: ${errorMessages}`
        );
    } else {
      if (policies.length)
        stopProgressBar(`Deleted ${policies.length} policies.`);
      outcome = true;
    }
  }
  debugMessage(
    `cli.PolicyOps.deletePoliciesByPolicySet: end [outcome=${outcome}]`
  );
  return outcome;
}

/**
 * Export policy to file
 * @param {string} policyId policy id/name
 * @param {string} file file name
 * @param {ApplicationExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicyToFile(
  policyId: string,
  file: string,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicyOps.exportPolicyToFile: begin`);
  showSpinner(`Exporting ${policyId}...`);
  try {
    let fileName = getTypedFilename(policyId, 'policy.authz');
    if (file) {
      fileName = file;
    }
    const exportData = await exportPolicy(policyId, options);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported ${policyId} to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting ${policyId}: ${error.message}`);
  }
  debugMessage(`cli.PolicyOps.exportPolicyToFile: end`);
  return outcome;
}

/**
 * Export policies to file
 * @param {string} file file name
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesToFile(
  file: string,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicyOps.exportPoliciesToFile: begin`);
  showSpinner(`Exporting all policy sets...`);
  try {
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}Policies`,
      'policy.authz'
    );
    if (file) {
      fileName = file;
    }
    const exportData = await exportPolicies(options);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported all policy sets to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting policy sets: ${error.message}`);
  }
  debugMessage(`cli.PolicyOps.exportPoliciesToFile: end`);
  return outcome;
}

/**
 * Export policies to file
 * @param {string} policySetId policy set id/name
 * @param {string} file file name
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesByPolicySetToFile(
  policySetId: string,
  file: string,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicyOps.exportPoliciesToFile: begin`);
  showSpinner(`Exporting all policy sets...`);
  try {
    let fileName = getTypedFilename(
      `all${
        titleCase(getRealmName(state.getRealm())) + titleCase(policySetId)
      }Policies`,
      'policy.authz'
    );
    if (file) {
      fileName = file;
    }
    const exportData = await exportPoliciesByPolicySet(policySetId, options);
    saveJsonToFile(exportData, fileName);
    succeedSpinner(`Exported all policy sets to ${fileName}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error exporting policy sets: ${error.message}`);
  }
  debugMessage(`cli.PolicyOps.exportPoliciesToFile: end`);
  return outcome;
}

/**
 * Export all policies to separate files
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesToFiles(
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  debugMessage(`cli.PolicyOps.exportPoliciesToFiles: begin`);
  const errors = [];
  try {
    const policies: PolicySkeleton[] = await readPolicies();
    createProgressBar(policies.length, 'Exporting policy sets...');
    for (const policy of policies) {
      const file = getTypedFilename(policy._id, 'policy.authz');
      try {
        const exportData: PolicyExportInterface = await exportPolicy(
          policy._id,
          options
        );
        saveJsonToFile(exportData, file);
        updateProgressBar(`Exported ${policy._id}.`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error exporting ${policy._id}.`);
      }
    }
    stopProgressBar(`Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error exporting policy sets to files`);
  }
  debugMessage(`cli.PolicyOps.exportPoliciesToFiles: end`);
  return 0 === errors.length;
}

/**
 * Export all policies to separate files
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesByPolicySetToFiles(
  policySetId: string,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  debugMessage(`cli.PolicyOps.exportPoliciesToFiles: begin`);
  const errors = [];
  try {
    const policies: PolicySkeleton[] =
      await readPoliciesByPolicySet(policySetId);
    createProgressBar(
      policies.length,
      `Exporting policies in policy set ${policySetId}...`
    );
    for (const policy of policies) {
      const file = getTypedFilename(policy._id, 'policy.authz');
      try {
        const exportData: PolicyExportInterface = await exportPolicy(
          policy._id,
          options
        );
        saveJsonToFile(exportData, file);
        updateProgressBar(`Exported ${policy._id}.`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error exporting ${policy._id}.`);
      }
    }
    stopProgressBar(`Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error exporting policy sets to files`);
  }
  debugMessage(`cli.PolicyOps.exportPoliciesToFiles: end`);
  return 0 === errors.length;
}

/**
 * Import policy from file
 * @param {string} policyId policy id/name
 * @param {string} file file name
 * @param {PolicyImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importPolicyFromFile(
  policyId: string,
  file: string,
  options: PolicyImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicyOps.importPolicyFromFile: begin`);
  showSpinner(`Importing ${policyId}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importPolicy(policyId, fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${policyId}.`);
  } catch (error) {
    failSpinner(`Error importing ${policyId}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicyOps.importPolicyFromFile: end`);
  return outcome;
}

/**
 * Import first policy from file
 * @param {string} file file name
 * @param {PolicyImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importFirstPolicyFromFile(
  file: string,
  options: PolicyImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicySetOps.importFirstPolicyFromFile: begin`);
  showSpinner(`Importing ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importFirstPolicy(fileData, options);
    outcome = true;
    succeedSpinner(`Imported ${file}.`);
  } catch (error) {
    failSpinner(`Error importing ${file}.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicySetOps.importFirstPolicyFromFile: end`);
  return outcome;
}

/**
 * Import policies from file
 * @param {string} file file name
 * @param {PolicyImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importPoliciesFromFile(
  file: string,
  options: PolicyImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  let outcome = false;
  debugMessage(`cli.PolicyOps.importPoliciesFromFile: begin`);
  showSpinner(`Importing ${file}...`);
  try {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    await importPolicies(fileData, options);
    outcome = true;
    succeedSpinner(
      `Imported ${file}${
        options.policySetName
          ? ' into policy set ' + options.policySetName
          : '.'
      }`
    );
  } catch (error) {
    failSpinner(
      `Error importing ${file}${
        options.policySetName
          ? ' into policy set ' + options.policySetName
          : '.'
      }`
    );
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicyOps.importPoliciesFromFile: end`);
  return outcome;
}

/**
 * Import policies from files
 * @param {PolicyImportOptions} options import options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importPoliciesFromFiles(
  options: PolicyImportOptions = { deps: true, prereqs: false }
): Promise<boolean> {
  const errors = [];
  try {
    debugMessage(`cli.PolicyOps.importPoliciesFromFiles: begin`);
    const names = fs.readdirSync('.');
    const files = names.filter((name) =>
      name.toLowerCase().endsWith('.policy.authz.json')
    );
    createProgressBar(files.length, 'Importing policies...');
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: PolicyExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.policyset).length;
        total += count;
        await importPolicies(fileData, options);
        updateProgressBar(`Imported ${count} policies from ${file}`);
      } catch (error) {
        errors.push(error);
        updateProgressBar(`Error importing policies from ${file}`);
        printMessage(error, 'error');
      }
    }
    stopProgressBar(
      `Finished importing ${total} policies from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressBar(`Error importing policies from files.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicyOps.importPoliciesFromFiles: end`);
  return 0 === errors.length;
}
