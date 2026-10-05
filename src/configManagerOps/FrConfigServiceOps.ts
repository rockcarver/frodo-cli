import fs from 'fs';
import {
  frodo,
  state,
  type FullService,
  type ServiceNextDescendent,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  stopProgressIndicator,
} from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { getFullServices, importServices } = frodo.service;
const { DEFAULT_REALM_KEY } = frodo.utils.constants;

/**
 * Export all services to separate files in fr-config-manager format
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportServices(
  realm?,
  name?
): Promise<boolean> {
  try {
    if (realm && realm !== DEFAULT_REALM_KEY) {
      const services = await getFullServices(false);
      processServices(services, realm, name);
    } else {
      for (const realm of await realmList()) {
        state.setRealm(realm);
        const services = await getFullServices(false);
        processServices(services, realm, name);
      }
    }
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

async function processServices(services, realm, name) {
  const realmDir = realm === '/' ? 'root' : realm;
  const fileDir = `realms/${realmDir}/services`;
  for (const service of services) {
    if (name && name !== service._type._id) {
      continue;
    }
    if (service.nextDescendents.length > 0) {
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
  }
}

/**
 * Process services for a realm in fr-config-manager format.
 * @param {string} realmDir realm directory name
 * @returns {Promise<FullService[]>} services with descendants attached, or [] if the directory doesn't exist
 */
async function processImportServices(realmDir: string): Promise<FullService[]> {
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

    const service = readJsonFile(`${realmsDir}/${entry.name}`) as FullService;

    const baseName = entry.name.replace('.json', '');
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
  }

  return results;
}
/**
 * Import all services from disk in fr-config-manager format. Iterates every realm
 * directory under realms/, mapping the 'root' directory to the '/' realm, and skips
 * the root realm on cloud deployments.
 * @param {string} name optional service name to import, imports all services if omitted
 * @param {string} realm option realm to import services to
 * @returns {Promise<boolean>} true if all imports were successful, false otherwise
 */
export async function configManagerImportServices(
  name?: string,
  realm?: string
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
        'No "realms" directory found.',
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

    for (const realmDir of realmsToProcess) {
      if (
        realmDir === 'root' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      state.setRealm(realmDir === 'root' ? '/' : realmDir);

      const services = await processImportServices(realmDir);
      const importData = {
        service: Object.fromEntries(
          services
            .filter((s) => !name || name === s._type._id)
            .map((s) => [s._type._id, s])
        ),
      };
      await importServices(importData, {
        clean: false,
        global: false,
        realm: true,
      });
    }
    stopProgressIndicator(indicatorId, 'Service import completed.', 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'Service import failed.', 'fail');
    printError(error, 'Error importing services');
  }
  return false;
}
