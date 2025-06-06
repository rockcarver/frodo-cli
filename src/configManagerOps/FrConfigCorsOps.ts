import { frodo } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { FullService } from '@rockcarver/frodo-lib/types/api/ServiceApi';

import { printError } from '../utils/Console';

const { config } = frodo.idm;
const { getFilePath, saveJsonToFile } = frodo.utils;

type CorsObject = { idmCorsConfig; corsServices; corsServiceGlobal };

/**
 * Export the global CORS configuration json in fr-config manager format
 * @returns True if file was successfully saved
 */
export async function exportCorsConfiguration(): Promise<boolean> {
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
      false
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
