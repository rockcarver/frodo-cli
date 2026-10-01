import { frodo, state, type FullService } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

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

/**
 * Delete the global CORS configuration json in fr-config manager format
 * @param {string} name name of secondary configuration to only be deleted
 * @returns True if file was successfully deleted
 */

export async function configManagerDeleteCors(
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  const named = name !== undefined;

  if (named && name.trim() === '') {
    printMessage(
      'The CORS name must not be empty. To delete all CORS configurations, leave out the name.',
      'error'
    );
    return false;
  }

  const run = new OperationRun({
    unit: 'CORS configuration',
    allowFailures,
  });

  try {
    const api = frodo.factory.generateAmApi({
      apiVersion: 'protocol=2.0,resource=1.0',
    });

    const url = `${state.getHost()}/json/global-config/services/CorsService`;

    const { data } = await api.post(
      `${url}?_action=nextdescendents`,
      undefined,
      { withCredentials: true }
    );

    const descendents = data.result.filter((descendent) =>
      named ? descendent._id === name : true
    );

    if (descendents.length === 0) {
      if (named) {
        printMessage(`CORS configuration '${name}' not found.`, 'error');
        return false;
      }

      printMessage('No CORS configurations found to delete.', 'warn');
      return true;
    }

    for (const descendent of descendents) {
      const corsName = descendent._id;

      if (dryRun) {
        printMessage(`Dry run: Deleting CORS configuration: ${corsName}`);
        continue;
      }

      try {
        await api.delete(`${url}/${descendent._type._id}/${descendent._id}`, {
          withCredentials: true,
        });

        printMessage(`Deleting CORS configuration: ${corsName}`);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error deleting CORS configuration ${corsName}`);
        run.recordFailure(corsName, causeOf(error));
      }
    }

    return dryRun ? true : run.finish();
  } catch (error) {
    printError(error, 'Error deleting CORS configurations');
    return false;
  }
}
