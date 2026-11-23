import fs from 'fs';
import {
  frodo,
  state,
  type PolicySetExportInterface,
  type PolicySetSkeleton,
  type PolicySkeleton,
  type ResourceTypeSkeleton,
} from '@rockcarver/frodo-lib';
import {
  isOneSafeSegment,
  nameInFolder,
  pulledFilePath,
  realmFolderOf,
  type PulledPaths,
} from '../utils/ConfigTreePath';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { clearOperationalAttributes, realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { importPolicySets, readPolicySet, readPolicySets } =
  frodo.authz.policySet;
const { readPoliciesByPolicySet, readPolicies, importPolicies } =
  frodo.authz.policy;
const { readResourceType, importResourceTypes } = frodo.authz.resourceType;

/**
 * The realm of a pull that selects one object, which needs a single realm: the realm that was given,
 * or the only realm of the tenant.
 * @param {string} what what the selector names, for the message
 * @param {string} onlyRealm the realm that was given
 * @returns {Promise<string | undefined>} the realm; undefined, after the reason was printed, when there is not exactly one
 */
async function singleRealm(
  what: string,
  onlyRealm?: string
): Promise<string | undefined> {
  const realms =
    onlyRealm && onlyRealm !== frodo.utils.constants.DEFAULT_REALM_KEY
      ? [onlyRealm]
      : await realmList();
  if (realms.length !== 1) {
    printMessage(`Error: for a named ${what}, specify a single realm`, 'error');
    return undefined;
  }
  return realms[0];
}

/**
 * What a config file for `configManagerExportAuthzPolicySets` would hold if it listed every
 * policy set of the realms: for each realm, the names of its policy sets, read from the tenant. The
 * realms are the one that was given, or every realm of the tenant (the root realm of an Identity
 * Cloud tenant included). A realm whose policy sets cannot be read is one failed operation of the
 * run and has no entry. A policy set whose name is not one name that a file can have (empty, `.`,
 * `..`, or a name with `/`, `\` or a control character) is skipped with a warning that names the
 * name and the realm, and so is a realm whose name is not a name or a path of names; a skip is not
 * an operation.
 *
 * With the name of a policy set the list is filtered: the policy set whose listed name is exactly
 * the one given is what the content holds. That needs a single realm. The listed name is used, never
 * the selector itself. A name that the list does not hold, a name that is not one name that a file
 * can have (the policy set exists, but is not skipped quietly), a list that cannot be read and a
 * name that needs a single realm fail the command: there is nothing for `--allow-failures` to allow.
 * @param {OperationRun} run the run of the command, which records the realms that cannot be read
 * @param {string} onlyRealm the realm to read; default: every realm
 * @param {string} setId pull only the policy set with this name
 * @returns {Promise<Record<string, string[]> | undefined>} the content of the file: the policy set names of each realm; undefined when the command cannot go on (the reason is printed)
 */
async function everythingOfAuthz(
  run: OperationRun,
  onlyRealm?: string,
  setId?: string
): Promise<Record<string, string[]> | undefined> {
  const everything: Record<string, string[]> = {};
  const realms =
    onlyRealm && onlyRealm !== frodo.utils.constants.DEFAULT_REALM_KEY
      ? [onlyRealm]
      : await realmList();
  if (setId !== undefined && realms.length !== 1) {
    printMessage(
      'Error: for a named policy set, specify a single realm',
      'error'
    );
    return undefined;
  }
  let found = false;
  for (const currentRealm of realms) {
    // the tenant names the realm: it is the name of a folder here, never a path
    const realmDir = run.deriveOrFail(
      `realm ${currentRealm}`,
      () => realmFolderOf(currentRealm),
      'Its policy sets are not pulled.'
    );
    if (realmDir === undefined) continue;
    state.setRealm(currentRealm);
    try {
      const names: string[] = [];
      for (const name of (await readPolicySets())
        .map((policySet) => policySet.name)
        .filter((listed) => setId === undefined || listed === setId)
        .sort()) {
        found = true;
        if (isOneSafeSegment(name)) {
          names.push(name);
        } else if (setId !== undefined) {
          // the one policy set that was asked for: nothing for the flag to allow
          printMessage(
            `Policy set '${name}' of realm '${currentRealm}' cannot be pulled: its name is not one name that a file can have.`,
            'error'
          );
          return undefined;
        } else {
          printMessage(
            `Skipping policy set '${name}' of realm '${currentRealm}': its name is not one name that a file can have.`,
            'warn'
          );
        }
      }
      everything[currentRealm] = names;
    } catch (error) {
      printError(
        error,
        `Error reading the policy sets of realm '${currentRealm}'`
      );
      // the one policy set that was asked for: nothing for the flag to allow
      if (setId !== undefined) return undefined;
      run.recordFailure(`realm ${realmDir}`, causeOf(error));
    }
  }
  if (setId !== undefined && !found) {
    printMessage(
      `Policy set '${setId}' not found in realm '${realms[0]}'.`,
      'error'
    );
    return undefined;
  }
  return everything;
}

/**
 * Export one policy: the policy, the resource type that it uses and the definition of the policy
 * set that it is in, nothing else, with the same files as `configManagerExportAuthzPolicySets`
 * writes for a policy set. The policy is looked up by its id in the list of the realm (which needs
 * a single realm) and the listed policy is what is written, so its policy set comes from the policy
 * itself. A policy that the list does not hold, a policy whose policy set does not have a name that
 * a file can have, a list that cannot be read and a missing single realm fail the command whatever
 * `allowFailures` says; a policy or a resource type that cannot be written is one failed operation.
 * @param {boolean} allowFailures True to succeed although the policy could not be exported (the failure is still summarised)
 * @param {string} onlyRealm the realm of the policy
 * @param {string} policyId the id of the policy
 * @returns {Promise<boolean>} false if the policy is not found, its policy set has no name that a file can have, or the policy cannot be exported (unless failures are allowed), true otherwise
 */
async function exportOnePolicy(
  allowFailures: boolean,
  onlyRealm: string | undefined,
  policyId: string
): Promise<boolean> {
  try {
    const realm = await singleRealm('policy', onlyRealm);
    if (realm === undefined) return false;
    let realmDir: string;
    try {
      realmDir = realmFolderOf(realm);
    } catch {
      printMessage(
        `The realm '${realm}' is not '/', a name or a path of names.`,
        'error'
      );
      return false;
    }
    state.setRealm(realm);
    const policy = (await readPolicies()).find(
      (listed) => listed._id === policyId
    );
    if (!policy) {
      printMessage(
        `Policy '${policyId}' not found in realm '${realm}'.`,
        'error'
      );
      return false;
    }
    const setName = policy.applicationName;
    if (!isOneSafeSegment(setName)) {
      // the one policy that was asked for: nothing for the flag to allow
      printMessage(
        `Policy '${policyId}' of realm '${realm}' cannot be pulled: the name of its policy set, '${setName}', is not one name that a file can have.`,
        'error'
      );
      return false;
    }
    const run = new OperationRun({ unit: 'policy', allowFailures });
    const pulledPaths: PulledPaths = new Map();
    await run.run(`${realmDir}/${policyId}`, async () => {
      const policySet = await readPolicySet(setName);
      policySet._id = policySet.name;
      const resourceType = await readResourceType(policy.resourceTypeUuid);
      resourceType._id = resourceType.uuid;
      const authzDir = `realms/${realmDir}/authorization`;
      saveJsonToFile(
        policySet,
        getFilePath(
          pulledFilePath(
            `${authzDir}/policy-sets/${nameInFolder(policySet.name)}/${nameInFolder(policySet.name)}.json`,
            pulledPaths
          ),
          true
        ),
        false,
        true,
        true
      );
      saveJsonToFile(
        policy,
        getFilePath(
          pulledFilePath(
            `${authzDir}/policy-sets/${nameInFolder(policySet.name)}/policies/${nameInFolder(policy.name)}.json`,
            pulledPaths
          ),
          true
        ),
        false,
        true,
        true
      );
      saveJsonToFile(
        resourceType,
        getFilePath(
          pulledFilePath(
            `${authzDir}/resource-types/${nameInFolder(resourceType.name)}.json`,
            pulledPaths
          ),
          true
        ),
        false,
        true,
        true
      );
    });
    return run.finish();
  } catch (error) {
    printError(error, 'Error exporting the policy');
    return false;
  }
}

/**
 * Export policy sets. Without a config file (`null`) every policy set of the realm that was given,
 * or of every realm of the tenant, is exported (see {@link everythingOfAuthz}); the name of a policy
 * set narrows that to the one policy set, and the id of a policy to the one policy (see
 * {@link exportOnePolicy}), both in a single realm. With a file, the file selects what is exported
 * and the realm is not used.
 * @param {string | null} configFile reference file for what sets to export; null to export every policy set
 * @param {boolean} allowFailures True to succeed although some policy sets could not be exported (the failures are still summarised)
 * @param {string} onlyRealm Without a file: the realm to export; default: every realm
 * @param {string} policyId Without a file: export only the policy with this id (needs a single realm)
 * @param {string} setId Without a file: export only the policy set with this name (needs a single realm)
 * @returns {Promise<boolean>} false if the config file cannot be read or a policy set cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportAuthzPolicySets(
  configFile: string | null,
  allowFailures: boolean = false,
  onlyRealm?: string,
  policyId?: string,
  setId?: string
): Promise<boolean> {
  if (configFile === null && policyId !== undefined) {
    return exportOnePolicy(allowFailures, onlyRealm, policyId);
  }
  let indicatorId;
  try {
    const run = new OperationRun({ unit: 'policy set', allowFailures });
    const policySets =
      configFile === null
        ? await everythingOfAuthz(run, onlyRealm, setId)
        : readJsonFile(configFile, false);
    if (!policySets) return false;
    indicatorId = createProgressIndicator(
      'determinate',
      Object.values(policySets as Record<string, object[]>).reduce(
        (total, arr) => total + arr.length,
        0
      ),
      'Exporting policy sets...'
    );
    const pulledPaths: PulledPaths = new Map();
    for (const realm of Object.keys(policySets)) {
      for (const setName of policySets[realm]) {
        await run.run(
          `${realm === '/' ? 'root' : realm}/${setName}`,
          async () => {
            state.setRealm(realm);
            const policySet = await readPolicySet(setName);
            policySet._id = policySet.name;
            // the tenant, or the file, names the realm: it is the name of a folder here, never a path
            const authzDir = `realms/${realmFolderOf(realm)}/authorization`;
            saveJsonToFile(
              policySet,
              getFilePath(
                pulledFilePath(
                  `${authzDir}/policy-sets/${nameInFolder(policySet.name)}/${nameInFolder(policySet.name)}.json`,
                  pulledPaths
                ),
                true
              ),
              false,
              true,
              true
            );
            const policies = await readPoliciesByPolicySet(policySet.name);
            for (const policy of policies) {
              saveJsonToFile(
                policy,
                getFilePath(
                  pulledFilePath(
                    `${authzDir}/policy-sets/${nameInFolder(policySet.name)}/policies/${nameInFolder(policy.name)}.json`,
                    pulledPaths
                  ),
                  true
                ),
                false,
                true,
                true
              );
              const resourceType = await readResourceType(
                policy.resourceTypeUuid
              );
              resourceType._id = resourceType.uuid;
              saveJsonToFile(
                resourceType,
                getFilePath(
                  pulledFilePath(
                    `${authzDir}/resource-types/${nameInFolder(resourceType.name)}.json`,
                    pulledPaths
                  ),
                  true
                ),
                false,
                true,
                true
              );
            }
            updateProgressIndicator(
              indicatorId,
              `Exported policy set ${setName}`
            );
          }
        );
      }
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? 'Finished exporting policy sets with errors.'
        : 'Finished exporting policy sets.',
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    if (indicatorId) {
      stopProgressIndicator(
        indicatorId,
        'Error exporting policy sets.',
        'fail'
      );
    }
    printError(error, 'Error exporting policy sets');
    return false;
  }
}

/**
 * Import authz policy sets
 * @param {boolean} allowFailures True to succeed although some realms could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} false if the realms folder is missing or a realm cannot be imported (unless failures are allowed), true otherwise
 */
export async function configManagerImportAuthzPolicies(
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing policy sets...'
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    if (!fs.existsSync(realmsDir)) {
      stopProgressIndicator(
        indicatorId,
        'Error importing policy sets.',
        'fail'
      );
      printMessage(
        `No realms folder found to import policy sets from: ${realmsDir}`,
        'error'
      );
      return false;
    }
    const realmDirs = fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    let totalSets = 0;
    let totalPolicies = 0;
    let totalTypes = 0;

    const run = new OperationRun({ unit: 'realm', allowFailures });
    for (const realmDir of realmDirs) {
      // the three imports of a realm depend on each other: when one fails, the
      // later ones are not tried for that realm, and the other realms still are
      await run.run(realmDir === 'root' ? '/' : realmDir, async () => {
        state.setRealm(realmDir === 'root' ? '/' : realmDir);
        const authzDir = `${realmsDir}/${realmDir}/authorization`;
        const importData: PolicySetExportInterface = {
          script: {},
          resourcetype: {},
          policy: {},
          policyset: {},
        };

        const resourceTypesDir = `${authzDir}/resource-types`;
        const rtDir = fs.existsSync(resourceTypesDir)
          ? fs.readdirSync(resourceTypesDir)
          : [];
        for (const file of rtDir) {
          if (!file.endsWith('.json')) continue;
          const rtData = readJsonFile(
            `${resourceTypesDir}/${file}`
          ) as ResourceTypeSkeleton;
          clearOperationalAttributes(rtData);
          importData.resourcetype[rtData.uuid] = rtData;
        }

        const policySetsDir = `${authzDir}/policy-sets`;
        const psDirs = fs.existsSync(policySetsDir)
          ? fs.readdirSync(policySetsDir)
          : [];
        for (const psDir of psDirs) {
          const psData = readJsonFile(
            `${policySetsDir}/${psDir}/${psDir}.json`
          ) as PolicySetSkeleton;
          clearOperationalAttributes(psData);
          importData.policyset[psData.name] = psData;

          const policiesDir = `${policySetsDir}/${psDir}/policies`;
          const pDir = fs.existsSync(policiesDir)
            ? fs.readdirSync(policiesDir)
            : [];
          for (const file of pDir) {
            if (!file.endsWith('.json')) continue;
            const pData = readJsonFile(
              `${policiesDir}/${file}`
            ) as PolicySkeleton;
            clearOperationalAttributes(pData);
            // importPolicies requires the id to be specified
            pData._id = pData.name;
            importData.policy[pData.name] = pData;
          }
        }

        // Resource types must be imported before policy sets and policies,
        // since both reference resource types by uuid (resourceTypeUuids /
        // resourceTypeUuid) and the server rejects a policy set or policy
        // whose referenced resource type doesn't exist yet.
        const importedTypes = await importResourceTypes(importData);
        totalTypes += importedTypes.length;
        const importedSets = await importPolicySets(importData, {
          deps: false,
          prereqs: false,
        });
        totalSets += importedSets.length;
        const importedPolicies = await importPolicies(importData, {
          deps: false,
          prereqs: false,
        });
        totalPolicies += importedPolicies.length;
      });
    }
    stopProgressIndicator(
      indicatorId,
      `Imported ${totalSets} policy sets, ${totalPolicies} policies, and ${totalTypes} resource types.`,
      run.hasFailures
        ? 'fail'
        : totalSets + totalPolicies + totalTypes > 0
          ? 'success'
          : 'warn'
    );
    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Error importing policy sets.', 'fail');
    printError(error, 'Error importing policy sets.');
    return false;
  }
}
