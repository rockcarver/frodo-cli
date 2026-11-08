import fs from 'fs';
import {
  frodo,
  FrodoError,
  state,
  type PolicyExportInterface,
  type PolicyExportOptions,
  type PolicyImportOptions,
  type PolicySkeleton,
} from '@rockcarver/frodo-lib';
import c from '../utils/ColorTheme';
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
  warnSpinner,
} from '../utils/Console';
import { OperationRun } from '../utils/OperationRun';

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
          policy.active ? c.positive('active') : c.negative('inactive'),
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
          policy.active ? c.positive('active') : c.negative('inactive'),
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
 * @param {boolean} allowFailures true to report policies that could not be deleted but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deletePolicies(allowFailures = false): Promise<boolean> {
  debugMessage(`cli.PolicyOps.deletePolicies: begin`);
  const run = new OperationRun({ unit: 'policy', allowFailures });
  let readFailed = false;
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
        run.recordSuccess();
      } catch (error) {
        errors.push(new FrodoError(`Error deleting policy ${policyId}`, error));
        run.recordFailure(policyId, error);
      }
    }
  } catch (error) {
    errors.push(new FrodoError(`Error deleting policies`, error));
    readFailed = true;
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
  return run.finish() && !readFailed;
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
 * Export the policies that `readList` returns to separate files. Every policy is its own operation: a policy
 * that cannot be exported or saved is printed and counted, the others are still exported, and one summary
 * names the ones that failed (record 0040). A failure to read the policies fails the command whatever
 * `--allow-failures` says.
 * @param {object} params structured and named parameters
 * @param {string} params.debugName name used in the debug messages
 * @param {Function} params.readList reads the policies to export
 * @param {string} params.message message of the progress indicator
 * @param {boolean} params.includeMeta true to include metadata, false otherwise
 * @param {boolean} params.keepModifiedProperties true to keep modified properties, otherwise delete them
 * @param {PolicyExportOptions} params.options export options
 * @param {boolean} params.allowFailures true to report policies that could not be exported but still succeed
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
async function exportEachPolicyToFile({
  debugName,
  readList,
  message,
  includeMeta,
  keepModifiedProperties,
  options,
  allowFailures,
}: {
  debugName: string;
  readList: () => Promise<PolicySkeleton[]>;
  message: string;
  includeMeta: boolean;
  keepModifiedProperties: boolean;
  options: PolicyExportOptions;
  allowFailures: boolean;
}): Promise<boolean> {
  debugMessage(`cli.PolicyOps.${debugName}: begin`);
  const run = new OperationRun({ unit: 'policy', allowFailures });
  const errors: FrodoError[] = [];
  let readFailed = false;
  let indicatorId: string;
  try {
    const policies: PolicySkeleton[] = await readList();
    indicatorId = createProgressIndicator(
      'determinate',
      policies.length,
      message
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
        run.recordSuccess();
      } catch (error) {
        errors.push(
          new FrodoError(`Error exporting policy ${policy._id}`, error)
        );
        run.recordFailure(policy._id, error);
      }
    }
    if (errors.length > 0) {
      stopProgressIndicator(indicatorId, `Error exporting policies`, 'fail');
    } else {
      stopProgressIndicator(indicatorId, `Export complete.`);
    }
  } catch (error) {
    readFailed = true;
    stopProgressIndicator(indicatorId, `Error exporting policies`, 'fail');
    printError(error);
  }
  for (const error of errors) {
    printError(error);
  }
  debugMessage(`cli.PolicyOps.${debugName}: end`);
  return run.finish() && !readFailed;
}

/**
 * Export all policies to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicyExportOptions} options export options
 * @param {boolean} allowFailures true to report policies that could not be exported but still succeed. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportPoliciesToFiles(
  includeMeta: boolean = true,
  keepModifiedProperties: boolean = false,
  options: PolicyExportOptions = {
    deps: true,
    prereqs: false,
    useStringArrays: true,
  },
  allowFailures = false
): Promise<boolean> {
  return exportEachPolicyToFile({
    debugName: 'exportPoliciesToFiles',
    readList: () => readPolicies(),
    message: 'Exporting policies...',
    includeMeta,
    keepModifiedProperties,
    options,
    allowFailures,
  });
}

/**
 * Export all policies of a policy set to separate files
 * @param {string} policySetId policy set id/name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} keepModifiedProperties true to keep modified properties, otherwise delete them. Default: false
 * @param {PolicyExportOptions} options export options
 * @param {boolean} allowFailures true to report policies that could not be exported but still succeed. Default: false
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
  },
  allowFailures = false
): Promise<boolean> {
  return exportEachPolicyToFile({
    debugName: 'exportPoliciesByPolicySetToFiles',
    readList: () => readPoliciesByPolicySet(policySetId),
    message: `Exporting policies in policy set ${policySetId}...`,
    includeMeta,
    keepModifiedProperties,
    options,
    allowFailures,
  });
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
    const policy = await importPolicy(policyId, fileData, options);
    if (policy) {
      succeedSpinner(`Imported ${policyId}.`);
    } else {
      warnSpinner(`Did not import ${policyId} since no changes were made.`);
    }
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
    if (policy) {
      succeedSpinner(
        `Imported first policy with id '${policy._id}' from ${filePath}.`
      );
    } else {
      warnSpinner(
        `Did not import first policy from ${filePath} since no changes were made.`
      );
    }
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
    const policies = await importPolicies(fileData, options);
    (policies.length ? succeedSpinner : warnSpinner)(
      `Imported ${policies.length} policies from ${filePath}${
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
  let failedFiles = 0;
  try {
    debugMessage(`cli.PolicyOps.importPoliciesFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => {
        const normalizedName = name.toLowerCase();
        return (
          normalizedName.endsWith('.policy.authz.json') ||
          normalizedName.endsWith('.policy.json')
        );
      })
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
        const policies = await importPolicies(fileData, options);
        total += policies.length;
        updateProgressIndicator(
          indicatorId,
          `Imported ${policies.length} policies from ${file}`
        );
      } catch (error) {
        errors.push(error);
        failedFiles += 1;
        updateProgressIndicator(
          indicatorId,
          `Error importing policies from ${file}`
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(
        `Failed after processing ${total} policies from ${files.length} files; ${failedFiles} files had errors.`,
        errors
      );
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} policies from ${files.length} files.`,
      total ? 'success' : 'warn'
    );
    debugMessage(`cli.PolicyOps.importPoliciesFromFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing policies`, 'fail');
    printError(error);
  }
  return false;
}
