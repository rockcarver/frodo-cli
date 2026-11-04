import { frodo, type IdObjectSkeletonInterface } from '@rockcarver/frodo-lib';
import { printError } from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;
const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;

/**
 * Export the email provider configuration json in fr-config manager format
 * @returns {Promise<boolean>} True if file was successfully saved
 */
export async function configManagerExportEmailProviderConfiguration(): Promise<boolean> {
  try {
    const emailProvider: IdObjectSkeletonInterface =
      await readConfigEntity('external.email');

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

/**
 * Imports an email provider from a config-manager export
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportEmailProvider(): Promise<boolean> {
  try {
    const importData = readJsonFile(
      getFilePath('email-provider/external.email.json')
    ) as IdObjectSkeletonInterface;
    await importConfigEntities({ idm: { [importData._id]: importData } });
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
