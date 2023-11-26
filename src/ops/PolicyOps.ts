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
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../utils/Console';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';

const { getRealmName, getFilePath, getWorkingDirectory } = frodo.utils;
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
  deletePolicy,
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
    if (long) {
      const table = createTable(['Id', 'Description', 'Status']);
      for (const policy of policies) {
        table.push([
          `${policy._id}`,
          `${policy.description}`,
          policy.active ? 'active'['brightGreen'] : 'inactive'['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      for (const policy of policies) {
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
    if (long) {
      const table = createTable(['Id', 'Description', 'Status']);
      for (const policy of policies) {
        table.push([
          `${policy._id}`,
          `${policy.description}`,
          policy.active ? 'active'['brightGreen'] : 'inactive'['brightRed'],
        ]);
      }
      printMessage(table.toString(), 'data');
    } else {
      for (const policy of policies) {
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
export async function deletePolicyById(policyId: string): Promise<boolean> {
  debugMessage(`cli.PolicyOps.deletePolicy: begin`);
  showSpinner(`Deleting ${policyId}...`);
  let outcome = false;
  try {
    debugMessage(`Deleting policy ${policyId}`);
    await deletePolicy(policyId);
    succeedSpinner(`Deleted ${policyId}.`);
    outcome = true;
  } catch (error) {
    failSpinner(`Error deleting policy ${policyId}: ${error}`);
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
  let indicatorId: string;
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
      indicatorId = createProgressIndicator(
        'determinate',
        policies.length,
        `Deleting ${policies.length} policies...`
      );
    for (const policy of policies) {
      const policyId = policy._id;
      try {
        debugMessage(`Deleting policy ${policyId}`);
        await deletePolicy(policyId);
        updateProgressIndicator(indicatorId, `Deleted ${policyId}`);
      } catch (error) {
        error.message = `Error deleting policy ${policyId}: ${error}`;
        updateProgressIndicator(indicatorId, error.message);
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
        stopProgressIndicator(
          indicatorId,
          `Error deleting all policies: ${errorMessages}`
        );
    } else {
      if (policies.length)
        stopProgressIndicator(
          indicatorId,
          `Deleted ${policies.length} policies.`
        );
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
  let indicatorId: string;
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
      indicatorId = createProgressIndicator(
        'determinate',
        policies.length,
        `Deleting ${policies.length} policies from policy set ${policySetId}...`
      );
    for (const policy of policies) {
      const policyId = policy._id;
      try {
        debugMessage(`Deleting policy ${policyId}`);
        await deletePolicy(policyId);
        updateProgressIndicator(indicatorId, `Deleted ${policyId}`);
      } catch (error) {
        error.message = `Error deleting policy ${policyId} from policy set ${policySetId}: ${error}`;
        updateProgressIndicator(indicatorId, error.message);
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
        stopProgressIndicator(
          indicatorId,
          `Error deleting all policies from policy set ${policySetId}: ${errorMessages}`
        );
    } else {
      if (policies.length)
        stopProgressIndicator(
          indicatorId,
          `Deleted ${policies.length} policies.`
        );
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
    const filePath = getFilePath(fileName, true);
    const exportData = await exportPolicy(policyId, options);
    saveJsonToFile(exportData, filePath);
    succeedSpinner(`Exported ${policyId} to ${filePath}.`);
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
    const filePath = getFilePath(fileName, true);
    const exportData = await exportPolicies(options);
    saveJsonToFile(exportData, filePath);
    succeedSpinner(`Exported all policy sets to ${filePath}.`);
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
    const filePath = getFilePath(fileName, true);
    const exportData = await exportPoliciesByPolicySet(policySetId, options);
    saveJsonToFile(exportData, filePath);
    succeedSpinner(`Exported all policy sets to ${filePath}.`);
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
  let indicatorId: string;
  try {
    const policies: PolicySkeleton[] = await readPolicies();
    indicatorId = createProgressIndicator(
      'determinate',
      policies.length,
      'Exporting policy sets...'
    );
    for (const policy of policies) {
      const file = getTypedFilename(policy._id, 'policy.authz');
      try {
        const exportData: PolicyExportInterface = await exportPolicy(
          policy._id,
          options
        );
        saveJsonToFile(exportData, getFilePath(file, true));
        updateProgressIndicator(indicatorId, `Exported ${policy._id}.`);
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(indicatorId, `Error exporting ${policy._id}.`);
      }
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(indicatorId, `Error exporting policy sets to files`);
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
  let indicatorId: string;
  try {
    const policies: PolicySkeleton[] =
      await readPoliciesByPolicySet(policySetId);
    indicatorId = createProgressIndicator(
      'determinate',
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
        saveJsonToFile(exportData, getFilePath(file, true));
        updateProgressIndicator(indicatorId, `Exported ${policy._id}.`);
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(indicatorId, `Error exporting ${policy._id}.`);
      }
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(indicatorId, `Error exporting policy sets to files`);
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
    const data = fs.readFileSync(getFilePath(file), 'utf8');
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
  const filePath = getFilePath(file);
  showSpinner(`Importing first policy from ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    const policy = await importFirstPolicy(fileData, options);
    outcome = true;
    succeedSpinner(
      `Imported first policy with id '${policy._id}' from ${filePath}.`
    );
  } catch (error) {
    failSpinner(`Error importing first policy from ${filePath}.`);
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
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importPolicies(fileData, options);
    outcome = true;
    succeedSpinner(
      `Imported ${filePath}${
        options.policySetName
          ? ' into policy set ' + options.policySetName
          : '.'
      }`
    );
  } catch (error) {
    failSpinner(
      `Error importing ${filePath}${
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
  let indicatorId: string;
  try {
    debugMessage(`cli.PolicyOps.importPoliciesFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.policy.authz.json'))
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing policies...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: PolicyExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.policyset).length;
        total += count;
        await importPolicies(fileData, options);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} policies from ${file}`
        );
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error importing policies from ${file}`
        );
        printMessage(error, 'error');
      }
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} policies from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(indicatorId, `Error importing policies from files.`);
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicyOps.importPoliciesFromFiles: end`);
  return 0 === errors.length;
}
