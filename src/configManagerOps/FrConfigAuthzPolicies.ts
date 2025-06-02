import { frodo, state } from '@rockcarver/frodo-lib';
import { verboseMessage} from '../utils/Console';
import { PolicySetSkeleton} from '@rockcarver/frodo-lib/types/api/PolicySetApi';
import { PolicySkeleton } from '@rockcarver/frodo-lib/types/api/PoliciesApi';
import { ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';

const { getFilePath, saveJsonToFile } = frodo.utils;
const {policySet, policy, resourceType} = frodo.authz;
const { readRealms } = frodo.realm;

// save all policy sets and their policies in the currently set state realm
async function saveRealmPolicySets() {
    const allPolicySets: PolicySetSkeleton[] = await policySet.readPolicySets();
    if(allPolicySets.length !== 0) {
        verboseMessage(`\n${state.getRealm()} realm:`);
        for (const ps of allPolicySets) {
            await savePolicySet(ps);
        }
    }
}

// save specific policy set
async function savePolicySet(ps: PolicySetSkeleton) {
    verboseMessage(`    Saving ${ps.name} policy-set.`);
    const psObject = {
        _id: ps.name,
        _rev: ps.lastModifiedDate.toString(),
        applicationType: ps.applicationType,
        attributeNames: ps.attributes ?? [],
        conditions: ps.conditions,
        createdBy: ps.createdBy,
        creationDate: ps.creationDate,
        description: ps.description,
        displayName: ps.displayName,
        editable: ps.editable,
        entitlementCombiner: ps.entitlementCombiner,
        lastModifiedBy: ps.lastModifiedBy,
        lastModifiedDate: ps.lastModifiedDate,
        name: ps.name,
        resourceComparator: ps.resourceComparator,
        resourceTypeUuids: ps.resourceTypeUuids,
        saveIndex: ps.saveIndex,
        searchIndex: ps.searchIndex,
        subjects: ps.subjects
    };

    // save to same relative location as fr-config-manager
    saveJsonToFile(psObject, getFilePath(`realms/${state.getRealm()}/authorization/policy-sets/${psObject.name}/${psObject.name}.json`, true), false);

    // create policies directory if it doesnt exist even if there are no policies, thats what fr-config-manager does
    getFilePath(`realms/${state.getRealm()}/authorization/policy-sets/${psObject.name}/policies/`, true);

    // save the policies associated with this specific policy set
    const allPoliciesOfThis: PolicySkeleton[] = await policy.readPoliciesByPolicySet(ps.name);
    if(allPoliciesOfThis.length !== 0){
        for(const p of allPoliciesOfThis){
            await savePolicy(p);
        }
    }
}

// Save specific policy
async function savePolicy(p: PolicySkeleton) {
    verboseMessage(`        Saving ${p.name} policy.`);
    const pObject = {
        _id: p._id,
        _rev: p._rev,
        actionValues: p.actionValues,
        active: p.active,
        applicationName: p.applicationName,
        createdBy: p.createdBy,
        creationDate: p.creationDate,
        description: p.description,
        lastModifiedBy: p.lastModifiedBy,
        lastModifiedDate: p.lastModifiedDate,
        name: p.name,
        resourceTypeUuid: p.resourceTypeUuid,
        resources: p.resources,
        subject: p.subject
    }

    // save to that policy sets policy folder
    saveJsonToFile(pObject, getFilePath(`realms/${state.getRealm()}/authorization/policy-sets/${p.applicationName}/policies/${p.name}.json`, true), false);
    
    // also save resource type, might want to check for duplicates in the future if that happens alot
    const r: ResourceTypeSkeleton = await resourceType.readResourceType(p.resourceTypeUuid);
    verboseMessage(`            Saving ${r.name} resource-type.`);
    const rObject = {
        _id: r.uuid,
        _rev: Date.now().toString(),
        actions: r.actions,
        createdBy: r.createdBy,
        creationDate: r.creationDate,
        description: r.description,
        lastModifiedBy: r.lastModifiedBy,
        lastModifiedDate: r.lastModifiedDate,
        name: r.name,
        patterns: r.patterns,
        uuid: r.uuid
    }
    saveJsonToFile(rObject, getFilePath(`realms/${state.getRealm()}/authorization/resource-types/${r.name}.json`, true), false);
}


export async function exportAuthzPoliciesToFiles(all: boolean = false, policySetName: string = null):Promise<boolean> {
    // if -a or --all is included
    if(all) {
        verboseMessage('Exporting all authorization policies from tenant.');
        for (const realmm of await readRealms()){
            // set realm of state because policySet.exportPolicySets() uses state to check realm 
            state.setRealm(realmm.name);
            await saveRealmPolicySets();
        }
    }

    // if -p or --p-set is included 
    else if (policySetName) {
        verboseMessage(`Exporting all authorization policies from ${policySetName} in the ${state.getRealm()} realm.`);
        await savePolicySet(await policySet.readPolicySet(policySetName));
    }

    // otherwise just save all policy sets in current realm
    else {
        verboseMessage(`Exporting all authorization policies from all sets in the ${state.getRealm()} realm.`);
        await saveRealmPolicySets();
    }
    return true;
}

// resource types folder is only created if there are policies in the policy set that have a resource type. If the policy set is empty, 
// no resource type folder. Even though each policy set has a list of resource types, if there are no policies in that set, no resource folder will be made