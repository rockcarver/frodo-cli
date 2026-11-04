import { frodo } from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';

const { readConfigEntity, importConfigEntities } = frodo.idm.config;

const METADATA_ID = 'custom-config.metadata';

/**
 * Export metadata configuration in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportMetadata(): Promise<boolean> {
  try {
    printMessage(await readConfigEntity(METADATA_ID), 'data');
    return true;
  } catch (error) {
    printError(error, `Error exporting config-metadata`);
  }
  return false;
}

/**
 * Import metadata configuration from fr-config-manager format.
 * @param {object} metadata an object containing the metadata to import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerImportMetadata(
  metadata: object
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing metadata config...'
  );
  try {
    await importConfigEntities({
      idm: {
        [METADATA_ID]: {
          _id: METADATA_ID,
          ...metadata,
        },
      },
    });
    stopProgressIndicator(
      indicatorId,
      'Metadata config import completed.',
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      'Metadata config import failed.',
      'fail'
    );
    printError(error, 'Error importing config-metadata.');
  }
  return false;
}
