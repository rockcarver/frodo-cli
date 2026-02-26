import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
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
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
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
export async function listPolicies(long: boolean = false): Promise<boolean> {
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
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * List policies by policy set
 * @param {string} policySetId policy set id/name
 * @param {boolean} long list with details
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listPoliciesByPolicySet(
  policySetId: string,
  long: boolean = false
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
  } catch (error) {
    printError(error);
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
  json: boolean = false
): Promise<boolean> {
  try {
    const policySet = await readPolicy(policyId);
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
 * Delete policy
 * @param {string} policyId policy id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicyById(policyId: string): Promise<boolean> {
  debugMessage(`cli.PolicyOps.deletePolicy: begin`);
  showSpinner(`Deleting ${policyId}...`);
  try {
    debugMessage(`Deleting policy ${policyId}`);
    await deletePolicy(policyId);
    succeedSpinner(`Deleted ${policyId}.`);
    debugMessage(`cli.PolicyOps.deletePolicy: end]`);
    return true;
  } catch (error) {
    failSpinner(`Error deleting policy ${policyId}`);
    printError(error);
  }
  return false;
}

/**
 * Delete all policies
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicies(): Promise<boolean> {
  debugMessage(`cli.PolicyOps.deletePolicies: begin`);
  const errors = [];
  let policies: PolicySkeleton[] = [];
  let indicatorId: string;
  try {
    showSpinner(`Retrieving all policies...`);
    try {
      policies = await readPolicies();
      succeedSpinner(`Found ${policies.length} policies.`);
    } catch (error) {
      failSpinner(`Error retrieving all policies`);
      throw new FrodoError(`Error retrieving all policies`, error);
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
        errors.push(new FrodoError(`Error deleting policy ${policyId}`, error));
      }
    }
  } catch (error) {
    errors.push(new FrodoError(`Error deleting policies`, error));
  } finally {
    if (errors.length > 0) {
      if (policies.length)
        stopProgressIndicator(
          indicatorId,
          `Error deleting all policies`,
          'fail'
        );
      for (const error of errors) {
        printError(error);
      }
    } else {
      if (policies.length)
        stopProgressIndicator(
          indicatorId,
          `Deleted ${policies.length} policies.`
        );
    }
  }
  debugMessage(`cli.PolicyOps.deletePolicies: end`);
  return errors.length === 0;
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
      failSpinner(
        `Error retrieving all policies from policy set ${policySetId}`
      );
      throw new FrodoError(
        `Error retrieving all policies from policy set ${policySetId}`,
        error
      );
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
        errors.push(
          new FrodoError(
            `Error deleting policy ${policyId} from policy set ${policySetId}`,
            error
          )
        );
      }
    }
  } catch (error) {
    errors.push(
      new FrodoError(
        `Error deleting policies from policy set ${policySetId}`,
        error
      )
    );
  } finally {
    if (errors.length) {
      if (policies.length)
        stopProgressIndicator(
          indicatorId,
          `Error deleting all policies from policy set ${policySetId}`,
          'fail'
        );
      for (const error of errors) {
        printError(error);
      }
    } else {
      if (policies.length)
        stopProgressIndicator(
          indicatorId,
          `Deleted ${policies.length} policies.`
        );
    }
  }
  debugMessage(`cli.PolicyOps.deletePoliciesByPolicySet: end`);
  return errors.length === 0;
}

/**
 * Export policy to file
 * @param {string} policyId policy id/name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {ApplicationExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPolicyToFile(
  policyId: string,
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  debugMessage(`cli.PolicyOps.exportPolicyToFile: begin`);
  showSpinner(`Exporting ${policyId}...`);
  try {
    let fileName = getTypedFilename(policyId, 'policy.authz');
    if (file) {
      fileName = file;
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportPolicy(policyId, options);
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
    succeedSpinner(`Exported ${policyId} to ${filePath}.`);
    debugMessage(`cli.PolicyOps.exportPolicyToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting ${policyId}`);
    printError(error);
  }
  return false;
}

/**
 * Export policies to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesToFile(
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  debugMessage(`cli.PolicyOps.exportPoliciesToFile: begin`);
  showSpinner(`Exporting all policies...`);
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
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
    succeedSpinner(`Exported all policies to ${filePath}.`);
    debugMessage(`cli.PolicyOps.exportPoliciesToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting policies`);
    printError(error);
  }
  return false;
}

/**
 * Export policies to file
 * @param {string} policySetId policy set id/name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesByPolicySetToFile(
  policySetId: string,
  file: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  }
): Promise<boolean> {
  debugMessage(`cli.PolicyOps.exportPoliciesToFile: begin`);
  showSpinner(`Exporting all policies...`);
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
    saveJsonToFile(
      exportData,
      filePath,
      includeMeta,
      false,
      keepModifiedProperties
    );
    succeedSpinner(`Exported all policies to ${filePath}.`);
    debugMessage(`cli.PolicyOps.exportPoliciesToFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error exporting policies`);
    printError(error);
  }
  return false;
}

/**
 * Export all policies to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesToFiles(
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
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
      'Exporting policies...'
    );
    for (const policy of policies) {
      const file = getTypedFilename(policy._id, 'policy.authz');
      try {
        const exportData: PolicyExportInterface = await exportPolicy(
          policy._id,
          options
        );
        saveJsonToFile(
          exportData,
          getFilePath(file, true),
          includeMeta,
          false,
          keepModifiedProperties
        );
        updateProgressIndicator(indicatorId, `Exported ${policy._id}.`);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting policies`, errors);
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
    debugMessage(`cli.PolicyOps.exportPoliciesToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting policies`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Export all policies to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicyExportOptions} options export options
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesByPolicySetToFiles(
  policySetId: string,
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
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
        saveJsonToFile(
          exportData,
          getFilePath(file, true),
          includeMeta,
          false,
          keepModifiedProperties
        );
        updateProgressIndicator(indicatorId, `Exported ${policy._id}.`);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error exporting policies`, errors);
    }
    stopProgressIndicator(indicatorId, `Export complete.`);
    debugMessage(`cli.PolicyOps.exportPoliciesToFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error exporting policies`, 'fail');
    printError(error);
  }
  return false;
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
  debugMessage(`cli.PolicyOps.importPolicyFromFile: begin`);
  showSpinner(`Importing ${policyId}...`);
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await importPolicy(policyId, fileData, options);
    succeedSpinner(`Imported ${policyId}.`);
    debugMessage(`cli.PolicyOps.importPolicyFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${policyId}`);
    printError(error);
  }
  return false;
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
  debugMessage(`cli.PolicySetOps.importFirstPolicyFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing first policy from ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    const policy = await importFirstPolicy(fileData, options);
    succeedSpinner(
      `Imported first policy with id '${policy._id}' from ${filePath}.`
    );
    debugMessage(`cli.PolicySetOps.importFirstPolicyFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing first policy`);
    printError(error);
  }
  return false;
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
  debugMessage(`cli.PolicyOps.importPoliciesFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importPolicies(fileData, options);
    succeedSpinner(
      `Imported ${filePath}${
        options.policySetName
          ? ' into policy set ' + options.policySetName
          : '.'
      }`
    );
    debugMessage(`cli.PolicyOps.importPoliciesFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(
      `Error importing ${filePath}${
        options.policySetName
          ? ' into policy set ' + options.policySetName
          : '.'
      }`
    );
    printError(error);
  }
  return false;
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
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing policies`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} policies from ${files.length} files.`
    );
    debugMessage(`cli.PolicyOps.importPoliciesFromFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing policies`);
    printError(error);
  }
  return false;
}
