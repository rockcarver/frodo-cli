import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { debugMessage, printError } from '../utils/Console';

const { getFilePath, saveJsonToFile, getCurrentRealmName } = frodo.utils;
const { getFullServices, createServiceExportTemplate } = frodo.service;

/**
 * Export all services to separate files in fr-config-manager format
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportServices(
  globalConfig: boolean = false
): Promise<boolean> {
  try {
    debugMessage(`cli.ServiceOps.exportServicesToFiles: start`);
    const services = await getFullServices(globalConfig);
    for (const service of services) {
      const fileDir = `realms/${getCurrentRealmName()}/services`;
      const filePath = getFilePath(
        `${fileDir}/${service._type._id}.json`,
        true
      );
      const exportData = createServiceExportTemplate();
      if (service._type._id === 'SocialIdentityProviders') {
        const descendentsDir = getFilePath(
          `${fileDir}/SocialIdentityProviders`,
          true
        );
        fs.mkdirSync(descendentsDir, { recursive: true });
        const descendents = service.nextDescendents || [];
        for (const descendent of descendents) {
          const descFilePath = `${descendentsDir}/${descendent.id}.json`;
          saveJsonToFile(descendent, descFilePath, false);
        }
        exportData.service[service._type._id] = {
          ...service,
          nextDescendents: undefined,
        };
        debugMessage(
          `cli.ServiceOps.exportServicesToFiles: exporting ${service._type._id} to ${filePath}`
        );
        saveJsonToFile(exportData.service[service._type._id], filePath, false);
      } else {
        exportData.service[service._type._id] = {
          ...service,
          nextDescendents: undefined,
        };
        debugMessage(
          `cli.ServiceOps.exportServicesToFiles: exporting ${service._type._id} to ${filePath}`
        );
        saveJsonToFile(exportData.service[service._type._id], filePath, false);
      }
    }
    debugMessage(`cli.ServiceOps.exportServicesToFiles: end.`);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
