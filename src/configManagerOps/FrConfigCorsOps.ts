import { frodo } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { FullService } from '@rockcarver/frodo-lib/types/api/ServiceApi';
import fs from 'fs';

import { printError } from '../utils/Console';

const { config } = frodo.idm;
const { getFilePath, saveJsonToFile } = frodo.utils;
const { importConfigEntities } = frodo.idm.config;
const { importServices } = frodo.service;

type CorsObject = { idmCorsConfig; corsServices; corsServiceGlobal };

/**
 * Export the global CORS configuration json in fr-config manager format
 * @returns True if file was successfully saved
 */
export async function configManagerExportCors(): Promise<boolean> {
  try {
    const cors: IdObjectSkeletonInterface =
      await config.readConfigEntity('servletfilter/cors');
    const services: FullService[] = await frodo.service.getFullServices(true);
    const corsServiceGlobal = services.find(
      (fullService) => fullService._type._id === 'CorsService'
    );
    const coreSsrvices = corsServiceGlobal.nextDescendents;
    delete corsServiceGlobal.nextDescendents;
    const newCorsObject: CorsObject = {
      idmCorsConfig: cors,
      corsServices: coreSsrvices,
      corsServiceGlobal: corsServiceGlobal,
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
 * @returns True if file was successfully saved
 */
export async function configManagerImportCors(): Promise<boolean> {
  try {
    const filePath = getFilePath('cors/cors-config.json');
    const readFile = fs.readFileSync(filePath, 'utf8');
    const importData = JSON.parse(readFile);

    const corsImport = {
      idm: {
        [importData.idmCorsConfig._id]: importData.idmCorsConfig,
      },
    };
    await importConfigEntities(corsImport);

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
