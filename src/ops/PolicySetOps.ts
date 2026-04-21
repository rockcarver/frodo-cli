import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
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
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const {
  getRealmName,
  getTypedFilename,
  saveJsonToFile,
  titleCase,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
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
  try {
    const policySets = await readPolicySets();
    policySets.sort((a, b) => a.name.localeCompare(b.name));
    for (const policySet of policySets) {
      printMessage(`${policySet.name}`, 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Describe policy set
 * @param {string} policySetId policy set id/name
 * @param {Object} json JSON output
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describePolicySet(
  policySetId: string,
  json: boolean = false
): Promise<boolean> {
  try {
    const policySet = await readPolicySet(policySetId);
    if (json) {
      printMessage(policySet, 'data');
    } else {
      const table = createObjectTable(policySet);
      printMessage(table.toString(), 'data');
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
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
  const errors = [];
  const policies: PolicySkeleton[] = await readPoliciesByPolicySet(policySetId);
  for (const policy of policies) {
    try {
      debugMessage(`Deleting policy ${policy._id}`);
      await deletePolicy(policy._id);
    } catch (error) {
      errors.push(
        new FrodoError(
          `Error deleting policy ${policy._id} in policy set ${policySetId}`,
          error
        )
      );
    }
  }
  if (errors.length > 0) {
    stopProgressIndicator(
      indicatorId,
      `Error deleting policies in policy set ${policySetId}`,
      'fail'
    );
    for (const error of errors) {
      printError(error);
    }
  } else {
    try {
      debugMessage(`Deleting policy set ${policySetId}`);
      await deletePolicySet(policySetId);
      stopProgressIndicator(indicatorId, `Deleted ${policySetId}.`, 'success');
      debugMessage(`cli.PolicySetOps.deletePolicySet: end`);
      return true;
    } catch (error) {
      stopProgressIndicator(
        indicatorId,
        `Error deleting policy set ${policySetId}`,
        'fail'
      );
      printError(error);
    }
  }
  return false;
}

/**
 * Delete all policy sets
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicySets(): Promise<boolean> {
  debugMessage(`cli.PolicySetOps.deletePolicySets: begin`);
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
      stopProgressIndicator(
        indicatorId,
        `Error retrieving all policy sets`,
        'fail'
      );
      throw new FrodoError(`Error retrieving all policy sets`, error);
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
            errors.push(
              new FrodoError(
                `Error deleting policy ${policy._id} in policy set ${policySetId}`,
                error
              )
            );
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
        errors.push(
          new FrodoError(`Error deleting policy set ${policySetId}`, error)
        );
      }
    }
  } catch (error) {
    errors.push(new FrodoError(`Error deleting policy sets`, error));
  } finally {
    if (errors.length) {
      if (policySets.length)
        stopProgressIndicator(indicatorId2, `Error deleting all policy sets`);
    } else {
      if (policySets.length)
        stopProgressIndicator(
          indicatorId2,
          `Deleted ${policySets.length} policy sets.`
        );
    }
  }
  debugMessage(`cli.PolicySetOps.deletePolicySets: end`);
  return errors.length === 0;
}

/**
 * Export policy set to file
 * @param {string} policySetId policy set id/name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicySetExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicySetToFile(
  policySetId: string,
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: PolicySetExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
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
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
    stopProgressIndicator(
      indicatorId,
      `Exported ${policySetId} to ${filePath}.`,
      'success'
    );
    debugMessage(`cli.PolicySetOps.exportPolicySetToFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting ${policySetId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export policy sets to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicySetExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicySetsToFile(
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: PolicySetExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
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
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
    stopProgressIndicator(
      indicatorId,
      `Exported all policy sets to ${filePath}.`,
      'success'
    );
    debugMessage(`cli.PolicySetOps.exportPolicySetsToFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting policy sets`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all policy sets to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicySetExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicySetsToFiles(
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
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
        saveJsonToFile(
          exportData,
          getFilePath(file, true),
          includeMeta,
          false,
          keepModifiedProperties
        );
        updateProgressIndicator(indicatorId, `Exported ${policySet.name}.`);
      } catch (error) {
        errors.push(error);
        updateProgressIndicator(
          indicatorId,
          `Error exporting ${policySet.name}.`
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting policy sets`, errors);
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
    debugMessage(`cli.PolicySetOps.exportPolicySetsToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting policy sets`, 'fail');
    printError(error);
  }
  return false;
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
    stopProgressIndicator(indicatorId, `Imported ${policySetId}.`, 'success');
    debugMessage(`cli.PolicySetOps.importPolicySetFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing ${policySetId}.`,
      'fail'
    );
    printError(error);
  }
  return false;
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
    stopProgressIndicator(
      indicatorId,
      `Imported first policy set '${policySet.name}'`,
      'success'
    );
    debugMessage(`cli.PolicySetOps.importFirstPolicySetFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing first policy set`,
      'fail'
    );
    printError(error);
  }
  return false;
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
    stopProgressIndicator(indicatorId, `Imported ${filePath}.`, 'success');
    debugMessage(`cli.PolicySetOps.importPolicySetsFromFile: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing policy sets`, 'fail');
    printError(error);
  }
  return false;
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
        printError(error);
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
    printError(error);
  }
  debugMessage(`cli.PolicySetOps.importPolicySetsFromFiles: end`);
  return 0 === errors.length;
}
