import { frodo } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { FullService } from '@rockcarver/frodo-lib/types/api/ServiceApi';

import { printError } from '../utils/Console';

const { config } = frodo.idm;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export the email provider configuration json in fr-config manager format
 * @returns
 */
export async function exportEmailProviderConfiguration(): Promise<boolean> {
  try {
    const emailProvider: IdObjectSkeletonInterface =
      await config.readConfigEntity('external.email');

    saveJsonToFile(
      emailProvider,
      getFilePath('email-provider/external.email.json', true),
      false,
      false
    );
    return true;
  } catch (error) {
    printError(error);
  }
}
