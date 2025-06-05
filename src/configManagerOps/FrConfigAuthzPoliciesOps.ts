import { frodo, state } from '@rockcarver/frodo-lib';
import { PolicySkeleton } from '@rockcarver/frodo-lib/types/api/PoliciesApi';
import { PolicySetSkeleton } from '@rockcarver/frodo-lib/types/api/PolicySetApi';
import { ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';

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
async function savePolicy(p: PolicySkeleton) {
  verboseMessage(`        Saving ${p.name} policy.`);
  // save to that policy-set's policy folder
  saveJsonToFile(
    p,
    getFilePath(
      `realms/${state.getRealm()}/authorization/policy-sets/${p.applicationName}/policies/${p.name}.json`,
      true
    ),
    false,
    false
  );

  // also save any resource types associated with the policy
  const r: ResourceTypeSkeleton = await resourceType.readResourceType(
    p.resourceTypeUuid
  );
  verboseMessage(`            Saving ${r.name} resource-type.`);
  r._id = r.uuid;
  // r._rev = Date.now().toString();
  saveJsonToFile(
    r,
    getFilePath(
      `realms/${state.getRealm()}/authorization/resource-types/${r.name}.json`,
      true
    ),
    false,
    false
  );
}

/**
 * Export policy-set using its name
 * @param criteria Name of the policy-set
 */
export async function exportAuthzPolicySet(criteria: ByName): Promise<boolean>;
/**
 * Export policy-set using the provided PolicySetSkeleton
 * @param criteria Policy-set object
 */
export async function exportAuthzPolicySet(
  criteria: BySkeleton
): Promise<boolean>;
/**
 * Export policy-set with each policy having its own file in fr-config-manager format
 * @param criteria Either PolicySetSkeleton or string
 * @returns True if export was successful
 */
export async function exportAuthzPolicySet(
  criteria: ByName | BySkeleton
): Promise<boolean> {
  try {
    // policySet.readPolicySet() will fail if the provided policy-set doesn't exist in the current-state realm
    const ps: PolicySetSkeleton =
      'ps' in criteria
        ? criteria.ps
        : await policySet.readPolicySet(criteria.policySetName);
    verboseMessage(`    Saving ${ps.name} policy-set.`);

    // these two fields aren't automatically provided in PolicySetSkeleton
    ps._id = ps.name;
    //ps._rev = ps.lastModifiedDate.toString();

    // save to same relative location as fr-config-manager
    saveJsonToFile(
      ps,
      getFilePath(
        `realms/${state.getRealm()}/authorization/policy-sets/${ps.name}/${ps.name}.json`,
        true
      ),
      false,
      false
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
        await savePolicy(p);
      }
    } else {
      verboseMessage(`There are no policies in the policy-set "${ps.name}"`);
    }

    return true;
  } catch (error) {
    printError(
      error,
      'policySetName' in criteria
        ? `Make sure the policy-set "${criteria.policySetName}" is in the realm "${state.getRealm()}"`
        : ''
    );
    return false;
  }
}

/**
 * Export all policy-sets from the current realm set in state
 * @returns True if export was successful
 */
export async function exportRealmAuthzPolicySets(): Promise<boolean> {
  try {
    const allPolicySets: PolicySetSkeleton[] = await policySet.readPolicySets();
    if (allPolicySets.length !== 0) {
      verboseMessage(`\n${state.getRealm()} realm:`);
      for (const ps of allPolicySets) {
        if (!(await exportAuthzPolicySet({ ps: ps }))) {
          // exportAuthzPolicySet() will print the error
          return false;
        }
      }
    } else {
      verboseMessage(
        `There are no policy sets in the realm "${state.getRealm()}"`
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
export async function exportAllAuthzPolicies(): Promise<boolean> {
  try {
    for (const realm of await readRealms()) {
      // set realm of state because policySet.exportPolicySets() uses state to check realm
      state.setRealm(realm.name);
      if (!(await exportRealmAuthzPolicySets())) {
        // exportRealmAuthzPolicySets() will print the error
        return false;
      }
    }
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
