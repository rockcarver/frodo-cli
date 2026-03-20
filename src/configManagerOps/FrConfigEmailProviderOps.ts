import { frodo } from '@rockcarver/frodo-lib';
import { IdObjectSkeletonInterface } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import fs from 'fs';

import { printError } from '../utils/Console';

const { config } = frodo.idm;
const { getFilePath, saveJsonToFile } = frodo.utils;

/**
 * Export the email provider configuration json in fr-config manager format
 * @returns True if file was successfully saved
 */
export async function configManagerExportEmailProviderConfiguration(): Promise<boolean> {
  try {
    const emailProvider: IdObjectSkeletonInterface =
      await config.readConfigEntity('external.email');

    saveJsonToFile(
      emailProvider,
      getFilePath('email-provider/external.email.json', true),
      false,
      true
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

export async function configManagerImportEmailProvider(): Promise<boolean> {
  try {
    const filePath = getFilePath('email-provider');
    const fileData = fs.readFileSync(
      `${filePath}/external.email.json`,
      'utf-8'
    );
    let importData = JSON.parse(fileData);
    importData = { idm: { [importData._id]: importData } };
    await config.importConfigEntities(importData);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
