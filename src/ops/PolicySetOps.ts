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
  createProgressIndicator,
  debugMessage,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import {
  getTypedFilename,
  saveJsonToFile,
  titleCase,
} from '../utils/ExportImportUtils';

const { getRealmName, getFilePath, getWorkingDirectory } = frodo.utils;
const { readPoliciesByPolicySet, deletePolicy } = frodo.authz.policy;
const {
  readPolicySets,
  readPolicySet,
  exportPolicySet,
  exportPolicySets,
  importPolicySet,
  importFirstPolicySet,
  importPolicySets,
  deletePolicySet,
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
export async function deletePolicySetById(
  policySetId: string
): Promise<boolean> {
  debugMessage(`cli.PolicySetOps.deletePolicySet: begin`);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Deleting ${policySetId}...`
  );
  let outcome = false;
  const errors = [];
  const policies: PolicySkeleton[] = await readPoliciesByPolicySet(policySetId);
  for (const policy of policies) {
    try {
      debugMessage(`Deleting policy ${policy._id}`);
      await deletePolicy(policy._id);
    } catch (error) {
      error.message = `Error deleting policy ${policy._id} in policy set ${policySetId}: ${error}`;
      errors.push(error);
    }
  }
  if (errors.length) {
    const errorMessages = errors.map((error) => error.message).join('\n');
    stopProgressIndicator(
      indicatorId,
      `Error deleting policies in policy set ${policySetId}: ${errorMessages}`,
      'fail'
    );
  } else {
    try {
      debugMessage(`Deleting policy set ${policySetId}`);
      await deletePolicySet(policySetId);
      stopProgressIndicator(indicatorId, `Deleted ${policySetId}.`, 'success');
      outcome = true;
    } catch (error) {
      stopProgressIndicator(
        indicatorId,
        `Error deleting policy set ${policySetId}: ${error}`,
        'fail'
      );
    }
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
  let indicatorId: string;
  let indicatorId2: string;
  try {
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Retrieving all policy sets...`
    );
    try {
      policySets = await readPolicySets();
      stopProgressIndicator(
        indicatorId,
        `Found ${policySets.length} policy sets.`,
        'success'
      );
    } catch (error) {
      error.message = `Error retrieving all policy sets: ${error.message}`;
      stopProgressIndicator(indicatorId, error.message, 'fail');
      throw error;
    }
    if (policySets.length)
      indicatorId2 = createProgressIndicator(
        'determinate',
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
        updateProgressIndicator(indicatorId2, `Deleted ${policySetId}`);
      } catch (error) {
        error.message = `Error deleting policy set ${policySetId}: ${error}`;
        updateProgressIndicator(indicatorId2, error.message);
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
        stopProgressIndicator(
          indicatorId2,
          `Error deleting all policy sets: ${errorMessages}`
        );
    } else {
      if (policySets.length)
        stopProgressIndicator(
          indicatorId2,
          `Deleted ${policySets.length} policy sets.`
        );
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
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Exporting ${policySetId}...`
  );
  try {
    let fileName = getTypedFilename(policySetId, 'policyset.authz');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportPolicySet(policySetId, options);
    saveJsonToFile(exportData, filePath);
    stopProgressIndicator(
      indicatorId,
      `Exported ${policySetId} to ${filePath}.`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting ${policySetId}: ${error.message}`,
      'fail'
    );
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
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Exporting all policy sets...`
  );
  try {
    let fileName = getTypedFilename(
      `all${titleCase(getRealmName(state.getRealm()))}PolicySets`,
      'policyset.authz'
    );
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportPolicySets(options);
    saveJsonToFile(exportData, filePath);
    stopProgressIndicator(
      indicatorId,
      `Exported all policy sets to ${filePath}.`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting policy sets: ${error.message}`,
      'fail'
    );
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
  let indicatorId: string;
  try {
    const policySets: PolicySetSkeleton[] = await readPolicySets();
    indicatorId = createProgressIndicator(
      'determinate',
      policySets.length,
      'Exporting policy sets...'
    );
    for (const policySet of policySets) {
      const file = getTypedFilename(policySet.name, 'policyset.authz');
      try {
        const exportData: PolicySetExportInterface = await exportPolicySet(
          policySet.name,
          options
        );
        saveJsonToFile(exportData, getFilePath(file, true));
        updateProgressIndicator(indicatorId, `Exported ${policySet.name}.`);
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error exporting ${policySet.name}.`
        );
      }
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(indicatorId, `Error exporting policy sets to files`);
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
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing ${policySetId}...`
  );
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await importPolicySet(policySetId, fileData, options);
    outcome = true;
    stopProgressIndicator(indicatorId, `Imported ${policySetId}.`, 'success');
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing ${policySetId}.`,
      'fail'
    );
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
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing first policy set from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    const policySet = await importFirstPolicySet(fileData, options);
    outcome = true;
    stopProgressIndicator(
      indicatorId,
      `Imported first policy set with name '${policySet.name}' from ${filePath}.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing first policy set from ${filePath}.`,
      'fail'
    );
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
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importPolicySets(fileData, options);
    outcome = true;
    stopProgressIndicator(indicatorId, `Imported ${filePath}.`, 'success');
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing ${filePath}.`, 'fail');
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
  let indicatorId: string;
  try {
    debugMessage(`cli.PolicySetOps.importPolicySetsFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.policyset.authz.json'))
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing policy sets...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData: PolicySetExportInterface = JSON.parse(data);
        const count = Object.keys(fileData.policyset).length;
        total += count;
        await importPolicySets(fileData, options);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} policy sets from ${file}`
        );
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error importing policy sets from ${file}`
        );
        printMessage(error, 'error');
      }
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} policy sets from ${files.length} files.`
    );
  } catch (error) {
    errors.push(error);
    stopProgressIndicator(
      indicatorId,
      `Error importing policy sets from files.`
    );
    printMessage(error, 'error');
  }
  debugMessage(`cli.PolicySetOps.importPolicySetsFromFiles: end`);
  return 0 === errors.length;
}
