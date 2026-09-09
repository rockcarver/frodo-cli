import { frodo, state } from '@rockcarver/frodo-lib';
import { PolicySkeleton } from '@rockcarver/frodo-lib/types/api/PoliciesApi';
import { PolicySetSkeleton } from '@rockcarver/frodo-lib/types/api/PolicySetApi';
import { ResourceTypeSkeleton } from '@rockcarver/frodo-lib/types/api/ResourceTypesApi';
import { PolicySetExportInterface } from '@rockcarver/frodo-lib/types/ops/PolicySetOps';
import fs from 'fs';

import {
  createProgressIndicator,
  printError,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { clearOperationalAttributes } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { importPolicySets, readPolicySet } = frodo.authz.policySet;
const { readPoliciesByPolicySet, importPolicies } = frodo.authz.policy;
const { readResourceType } = frodo.authz.resourceType;

/**
 * Export policy sets for all realms
 * @param {string} configFile required reference file for what sets to export
 * @returns {Promise<boolean>} return true if export succesful, false otherwise
 */
export async function configManagerExportAuthzPolicySets(
  configFile: string
): Promise<boolean> {
  let indicatorId;
  try {
    const policySets = readJsonFile(configFile, false);
    indicatorId = createProgressIndicator(
      'determinate',
      Object.values(policySets as Record<string, object[]>).reduce(
        (total, arr) => total + arr.length,
        0
      ),
      'Exporting policy sets...'
    );
    for (const realm of Object.keys(policySets)) {
      for (const setName of policySets[realm]) {
        state.setRealm(realm);
        const policySet = await readPolicySet(setName);
        policySet._id = policySet.name;
        const authzDir = `realms/${realm === '/' ? 'root' : realm}/authorization`;
        saveJsonToFile(
          policySet,
          getFilePath(
            `${authzDir}/policy-sets/${policySet.name}/${policySet.name}.json`,
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
              `${authzDir}/policy-sets/${policySet.name}/policies/${policy.name}.json`,
              true
            ),
            false,
            true,
            true
          );
          const resourceType = await readResourceType(policy.resourceTypeUuid);
          resourceType._id = resourceType.uuid;
          saveJsonToFile(
            resourceType,
            getFilePath(
              `${authzDir}/resource-types/${resourceType.name}.json`,
              true
            ),
            false,
            true,
            true
          );
        }
        updateProgressIndicator(indicatorId, `Exported policy set ${setName}`);
      }
    }
    stopProgressIndicator(
      indicatorId,
      'Finished exporting policy sets.',
      'success'
    );
    return true;
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
 * @returns {Promise<boolean>} true if all imports were successful
 */
export async function configManagerImportAuthzPolicies(): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Exporting policy sets...'
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    const realmDirs = fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const realmDir of realmDirs) {
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

      // This will import sets, but we can't use it to import policies and resource types since this handles script dependencies and set resource type dependencies which config-manager doesn't support
      await importPolicySets(importData, {
        deps: false,
        prereqs: false,
      });
      await importPolicies(importData, {
        deps: false,
        prereqs: true,
      });
    }
    stopProgressIndicator(
      indicatorId,
      'Success importing policy sets.',
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Error importing policy sets.', 'fail');
    printError(error, 'Error importing policy sets.');
    return false;
  }
}
