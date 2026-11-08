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
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { clearOperationalAttributes } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { importPolicySets, readPolicySet } = frodo.authz.policySet;
const { readPoliciesByPolicySet, importPolicies } = frodo.authz.policy;
const { readResourceType, importResourceTypes } = frodo.authz.resourceType;

/**
 * Export policy sets for all realms
 * @param {string} configFile required reference file for what sets to export
 * @param {boolean} allowFailures True to succeed although some policy sets could not be exported (the failures are still summarised)
 * @returns {Promise<boolean>} false if the config file cannot be read or a policy set cannot be exported (unless failures are allowed), true otherwise
 */
export async function configManagerExportAuthzPolicySets(
  configFile: string,
  allowFailures: boolean = false
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
    const run = new OperationRun({ unit: 'policy set', allowFailures });
    for (const realm of Object.keys(policySets)) {
      for (const setName of policySets[realm]) {
        await run.run(
          `${realm === '/' ? 'root' : realm}/${setName}`,
          async () => {
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
              const resourceType = await readResourceType(
                policy.resourceTypeUuid
              );
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
