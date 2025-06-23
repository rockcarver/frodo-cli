import { frodo, state } from '@rockcarver/frodo-lib';

import { printError } from '../utils/Console';
import { realmList } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { getFullServices } = frodo.service;

/**
 * Export all services to separate files in fr-config-manager format
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportServices(
  realm?,
  name?
): Promise<boolean> {
  try {
    if (realm && realm !== '__default__realm__') {
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
  const fileDir = `realms/${realm}/services`;
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
