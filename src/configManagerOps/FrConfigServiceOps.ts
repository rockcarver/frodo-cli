import fs from 'fs';
import {
  frodo,
  state,
  type FrodoError,
  type FullService,
  type ServiceNextDescendent,
} from '@rockcarver/frodo-lib';
import { combinedServiceError, importedServiceNameOf } from '../ops/ServiceOps';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { CLOUD_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;
const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { getFullServices, importServices } = frodo.service;
const { DEFAULT_REALM_KEY } = frodo.utils.constants;

const EXCLUDE_SERVICES = ['DataStoreService'];

/**
 * The service that the library names in the error it throws when it cannot read a service.
 * @param {unknown} error the nested error of one service that could not be read
 * @returns {string | undefined} the service id, or undefined if the message has another shape
 */
function readServiceNameOf(error: unknown): string | undefined {
  return (error as Error)?.message?.match(/ service '(.+)'$/)?.[1];
}

/**
 * Export all services to separate files in fr-config-manager format
 * The library reads the services of a realm in one call that throws one error naming each service it could not read
 * and returns none of the others: those services are reported and the other realms are still exported.
 * @param {string} realm The realm to export services from
 * @param {string} name The name of the service to export
 * @param {boolean} allowFailures true to succeed although some services could not be exported (the failures are still summarised)
 * @returns {Promise<boolean>} false if a named service does not exist, the realms cannot be listed, or a service cannot be read or exported (unless failures are allowed). No services when none was named is a success.
 */
export async function configManagerExportServices(
  realm?: string,
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'service', allowFailures });
    let exported = 0;
    for (const realm of realms) {
      if (
        realm === '/' &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      const realmDir = realm === '/' ? 'root' : realm;
      let services: FullService[];
      try {
        services = await getFullServices(false);
      } catch (error) {
        printError(error, `Error reading the services of realm ${realmDir}`);
        const nested = (error as FrodoError)?.originalErrors;
        if (
          Array.isArray(nested) &&
          nested.length > 0 &&
          nested.every((item) => readServiceNameOf(item))
        ) {
          // one nested error per service that could not be read
          run.recordCombinedError(error, {
            total: 0,
            fallbackName: `realm ${realmDir}`,
            itemName: (item) => `${realmDir}/${readServiceNameOf(item)}`,
          });
        } else {
          // the realm's services could not even be listed
          run.recordFailure(`realm ${realmDir}`, causeOf(error));
        }
        continue;
      }
      const fileDir = `realms/${realmDir}/services`;
      for (const service of services) {
        if (
          EXCLUDE_SERVICES.includes(service._type._id) ||
          (name && name !== service._type._id)
        ) {
          continue;
        }
        const serviceName = `${realmDir}/${service._type._id}`;
        exported++;
        try {
          if (service.nextDescendents?.length > 0) {
            for (const descendent of service.nextDescendents) {
              saveJsonToFile(
                descendent,
                getFilePath(
                  `${fileDir}/${service._type._id}/${descendent._id}.json`,
                  true
                ),
                false,
                true
              );
            }
          }
          delete service.nextDescendents;
          saveJsonToFile(
            service,
            getFilePath(`${fileDir}/${service._type._id}.json`, true),
            false,
            true
          );
          run.recordSuccess();
        } catch (error) {
          printError(error, `Error exporting service ${serviceName}`);
          run.recordFailure(serviceName, causeOf(error));
        }
      }
    }
    if (exported === 0 && !run.hasFailures) {
      if (name) {
        printMessage(`Service '${name}' not found.`, 'error');
        return false;
      }
      printMessage('No services found to export.');
      return true;
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Service export failed');
  }
  return false;
}

/**
 * Process services for a realm in fr-config-manager format.
 * A service file that cannot be read or parsed is recorded as a failed service in the run and left out.
 * @param {string} realmDir realm directory name
 * @param {OperationRun} run the run that tracks the services of the command
 * @returns {Promise<FullService[]>} services with descendants attached, or [] if the directory doesn't exist
 */
async function processImportServices(
  realmDir: string,
  run: OperationRun
): Promise<FullService[]> {
  const realmsDir = `${getWorkingDirectory()}/realms/${realmDir}/services`;
  if (!fs.existsSync(realmsDir)) {
    return [];
  }

  const results: FullService[] = [];
  const entries = fs.readdirSync(realmsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) {
      continue;
    }

    const baseName = entry.name.replace('.json', '');
    try {
      const service = readJsonFile(`${realmsDir}/${entry.name}`) as FullService;

      const subDirPath = `${realmsDir}/${baseName}`;

      const descendants: ServiceNextDescendent[] = [];
      if (fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory()) {
        for (const subEntry of fs.readdirSync(subDirPath, {
          withFileTypes: true,
        })) {
          if (!subEntry.name.endsWith('.json')) {
            continue;
          }
          descendants.push(
            readJsonFile(
              `${subDirPath}/${subEntry.name}`
            ) as ServiceNextDescendent
          );
        }
      }
      service.nextDescendents = descendants;

      results.push(service);
    } catch (error) {
      printError(error, `Error reading service ${realmDir}/${baseName}`);
      run.recordFailure(`${realmDir}/${baseName}`, causeOf(error));
    }
  }

  return results;
}
/**
 * Import all services from disk in fr-config-manager format. Iterates every realm
 * directory under realms/, mapping the 'root' directory to the '/' realm, and skips
 * the root realm on cloud deployments.
 * The library imports the services of a realm in one call that tries every service and throws one error naming each
 * service it could not import: those are reported and the other services and realms are still imported.
 * @param {string} name optional service name to import, imports all services if omitted
 * @param {string} realm option realm to import services to
 * @param {boolean} allowFailures true to succeed although some services could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} false if the realms folder or a named service does not exist, or a service cannot be read or imported (unless failures are allowed). No services when none was named is a success.
 */
export async function configManagerImportServices(
  name?: string,
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing services...'
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    if (!fs.existsSync(realmsDir)) {
      stopProgressIndicator(
        indicatorId,
        `Realms folder not found: ${realmsDir}`,
        'fail'
      );
      return false;
    }

    const realmsToProcess =
      realm && realm !== DEFAULT_REALM_KEY
        ? [realm === '/' ? 'root' : realm]
        : fs
            .readdirSync(realmsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name);

    const run = new OperationRun({ unit: 'service', allowFailures });
    let selectedCount = 0;
    for (const realmDir of realmsToProcess) {
      if (
        realmDir === 'root' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      state.setRealm(realmDir === 'root' ? '/' : realmDir);

      const services = (await processImportServices(realmDir, run)).filter(
        (s) => !name || name === s._type._id
      );
      if (services.length === 0) continue;
      selectedCount += services.length;
      const importData = {
        service: Object.fromEntries(services.map((s) => [s._type._id, s])),
      };
      try {
        await importServices(importData, {
          clean: false,
          global: false,
          realm: true,
        });
        for (let i = 0; i < services.length; i++) run.recordSuccess();
      } catch (error) {
        printError(error);
        run.recordCombinedError(combinedServiceError(error), {
          total: services.length,
          fallbackName: `realm ${realmDir}`,
          itemName: (nested) => {
            const serviceName = importedServiceNameOf(nested);
            return serviceName ? `${realmDir}/${serviceName}` : undefined;
          },
        });
      }
    }
    if (selectedCount === 0 && !run.hasFailures) {
      if (name) {
        stopProgressIndicator(
          indicatorId,
          `Service '${name}' not found in ${realmsDir}`,
          'fail'
        );
        return false;
      }
      stopProgressIndicator(
        indicatorId,
        `No services found to import in ${realmsDir}`,
        'success'
      );
      return true;
    }
    stopProgressIndicator(
      indicatorId,
      run.hasFailures
        ? 'Service import completed with failures.'
        : 'Service import completed.',
      run.hasFailures ? 'fail' : 'success'
    );
    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Service import failed.', 'fail');
    printError(error, 'Error importing services');
  }
  return false;
}
