import { frodo, state, type FullService } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFullServices, importServices } = frodo.service;
const { CLASSIC_DEPLOYMENT_TYPE_KEY } = frodo.utils.constants;

type CorsObject = { idmCorsConfig; corsServices; corsServiceGlobal };

/**
 * Export the global CORS configuration json in fr-config manager format
 * @returns True if file was successfully saved
 */
export async function configManagerExportCors(): Promise<boolean> {
  try {
    const services: FullService[] = await getFullServices(true);
    const corsServiceGlobal = services.find(
      (fullService) => fullService._type._id === 'CorsService'
    );
    if (!corsServiceGlobal) {
      printMessage('Global CORS service not found', 'error');
      return false;
    }
    const corsServices = corsServiceGlobal.nextDescendents;
    delete corsServiceGlobal.nextDescendents;
    const newCorsObject: CorsObject = {
      idmCorsConfig:
        state.getDeploymentType() === CLASSIC_DEPLOYMENT_TYPE_KEY
          ? {}
          : await readConfigEntity('servletfilter/cors'),
      corsServices,
      corsServiceGlobal,
    };

    saveJsonToFile(
      newCorsObject,
      getFilePath('cors/cors-config.json', true),
      false,
      true
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import the global CORS configuration into forgeops
 * @returns {Promise<boolean>} True if file was successfully saved
 */
export async function configManagerImportCors(): Promise<boolean> {
  try {
    const importData = readJsonFile(
      getFilePath('cors/cors-config.json')
    ) as CorsObject;

    if (state.getDeploymentType() !== CLASSIC_DEPLOYMENT_TYPE_KEY) {
      const corsImport = {
        idm: {
          [importData.idmCorsConfig._id]: importData.idmCorsConfig,
        },
      };
      await importConfigEntities(corsImport);
    }
    const fullCorsService = {
      ...importData.corsServiceGlobal,
      nextDescendents: importData.corsServices,
    };

    const corsServiceImport = {
      service: { [fullCorsService._type._id]: fullCorsService },
    };
    await importServices(corsServiceImport, {
      global: true,
      clean: false,
      realm: false,
    });

    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
