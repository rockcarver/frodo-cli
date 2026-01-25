import { frodo, state } from '@rockcarver/frodo-lib';
import { PolicySkeleton } from '@rockcarver/frodo-lib/types/api/PoliciesApi';
import { PolicySetSkeleton } from '@rockcarver/frodo-lib/types/api/PolicySetApi';
import { ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';
import { readFile } from 'fs/promises';

import { printError, verboseMessage } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { policySet, policy, resourceType } = frodo.authz;
const { readRealms } = frodo.realm;

type ByName = { policySetName: string };
type BySkeleton = { ps: PolicySetSkeleton };

/**
 * Export policy to its own separate file in fr-config-manager format
 * along with any resource types its associated with
 * @param {PolicySkeleton} p Policy object to export
 */
async function exportPolicy(p: PolicySkeleton) {
  verboseMessage(`    Exporting the policy "${p.name}".`);
  // save to that policy-set's policy folder
  saveJsonToFile(
    p,
    getFilePath(
      `realms/${state.getRealm()}/authorization/policy-sets/${p.applicationName}/policies/${p.name}.json`,
      true
    ),
    false,
    true
  );

  // also save any resource types associated with the policy
  const r: ResourceTypeSkeleton = await resourceType.readResourceType(
    p.resourceTypeUuid
  );
  verboseMessage(`      Exporting the resource-type "${r.name}".`);
  r._id = r.uuid;

  // The _.rev field changes to the utc time every time it is requested, been commented out for now
  // r._rev = Date.now().toString();

  saveJsonToFile(
    r,
    getFilePath(
      `realms/${state.getRealm()}/authorization/resource-types/${r.name}.json`,
      true
    ),
    false,
    true
  );
}

// Export policy-set using its name {policySetName: ...}
export async function configManagerExportAuthzPolicySet(
  criteria: ByName,
  configFile: string
): Promise<boolean>;
// Export policy-set using the provided PolicySetSkeleton {ps: ...}
export async function configManagerExportAuthzPolicySet(
  criteria: BySkeleton,
  configFile: string
): Promise<boolean>;
/**
 * Export policy-set with each policy having its own file in fr-config-manager format
 * @param criteria Either PolicySetSkeleton or string
 * @param configFile If this is provided, this function only succeeds if the provided policy set is defined in the config file.
 * @returns True if export was successful
 */
export async function configManagerExportAuthzPolicySet(
  criteria: ByName | BySkeleton,
  configFile: string = null
): Promise<boolean> {
  try {
    // policySet.readPolicySet() will fail if the provided policy-set doesn't exist in the current-state realm
    const ps: PolicySetSkeleton =
      'ps' in criteria
        ? criteria.ps
        : await policySet.readPolicySet(criteria.policySetName);

    // make sure ps is in the config file if one is passed
    if (configFile) {
      verboseMessage(`  Reading the config file "${configFile}"`);
      const configFileData = JSON.parse(
        await readFile(configFile, { encoding: 'utf8' })
      );
      if (
        !configFileData[state.getRealm()] ||
        !configFileData[state.getRealm()].includes(ps.name)
      ) {
        throw new Error(
          `The policy set "${ps.name}" is not defined for the ${state.getRealm()} realm in the config file "${configFile}".`
        );
      }
      verboseMessage(
        `    The policy set "${ps.name}" was found in the ${state.getRealm()} realm block of the config file, moving forward.`
      );
    }
    verboseMessage(`  Exporting the policy set "${ps.name}"`);

    // these two fields aren't automatically provided in PolicySetSkeleton
    ps._id = ps.name;
    ps._rev = ps.lastModifiedDate.toString();

    // save to same relative location as fr-config-manager
    saveJsonToFile(
      ps,
      getFilePath(
        `realms/${state.getRealm()}/authorization/policy-sets/${ps.name}/${ps.name}.json`,
        true
      ),
      false,
      true
    );

    // create policies directory if it doesnt exist even if there are no policies, thats what fr-config-manager does
    getFilePath(
      `realms/${state.getRealm()}/authorization/policy-sets/${ps.name}/policies/`,
      true
    );

    // save the policies associated with this specific policy set
    const allPoliciesOfThis: PolicySkeleton[] =
      await policy.readPoliciesByPolicySet(ps.name);
    if (allPoliciesOfThis.length !== 0) {
      for (const p of allPoliciesOfThis) {
        await exportPolicy(p);
      }
    } else {
      verboseMessage(
        `    There are no policies in the policy-set "${ps.name}"`
      );
    }

    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Export all policy-sets defined in the config file, current state realm is ignored, all realms in config file are iterated over
 * @param configFile json file to read from.
 * @returns True if all policy sets were written successfully
 */
export async function configManagerExportAuthzPolicySets(
  configFile: string
): Promise<boolean> {
  try {
    verboseMessage(`Reading the config file "${configFile}"`);
    const configFileData = JSON.parse(
      await readFile(configFile, { encoding: 'utf8' })
    ) as Record<string, string[]>;
    for (const [realm, policies] of Object.entries(configFileData)) {
      if (policies.length !== 0) {
        state.setRealm(realm);
        verboseMessage(`\n${state.getRealm()} realm:`);
        for (const policy of policies) {
          if (
            !(await configManagerExportAuthzPolicySet(
              { policySetName: policy },
              null
            ))
          ) {
            return false;
          }
        }
      } else {
        verboseMessage(
          `\nNo policy sets defined for the ${realm} realm in the config file.`
        );
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Export all policy-sets from the current realm set in state
 * @returns True if export was successful
 */
export async function configManagerExportAuthzPolicySetsRealm(): Promise<boolean> {
  try {
    const allPolicySets: PolicySetSkeleton[] = await policySet.readPolicySets();
    if (allPolicySets.length !== 0) {
      verboseMessage(`\n${state.getRealm()} realm:`);
      for (const ps of allPolicySets) {
        if (!(await configManagerExportAuthzPolicySet({ ps: ps }, null))) {
          return false;
        }
      }
    } else {
      verboseMessage(
        `  There are no policy sets in the realm "${state.getRealm()}"`
      );
    }
  } catch (error) {
    printError(error);
    return false;
  }
  return true;
}

/**
 * Export all policy-sets from all realms
 * @returns True if export was successful
 */
export async function configManagerExportAuthzPoliciesAll(): Promise<boolean> {
  try {
    for (const realm of await readRealms()) {
      // set realm of state because policySet.readPolicySets() uses state to check realm
      state.setRealm(realm.name);
      if (!(await configManagerExportAuthzPolicySetsRealm())) {
        return false;
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
