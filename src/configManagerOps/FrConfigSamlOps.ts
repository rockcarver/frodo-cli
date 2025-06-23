import { frodo, state } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { printError } from '../utils/Console';
import {
  escapePlaceholders,
  replaceAllInJson,
  safeFileNameUnderscore,
} from '../utils/FrConfig';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { exportSaml2Provider } = frodo.saml2.entityProvider;
const { exportCircleOfTrust } = frodo.saml2.circlesOfTrust;
/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} envFile File that defines environment specific variables for replacement during configuration export/import
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportSaml(file): Promise<boolean> {
  try {
    const objects = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const realm of Object.keys(objects)) {
      state.setRealm(realm);
      for (const samlProvider of objects[realm].samlProviders) {
        const result = await exportSaml2Provider(samlProvider.entityId, {
          deps: false,
        });
        const samlResult = escapePlaceholders(result);
        let fileDirectory = `realms/${realm}/realm-config/saml`;
        const saveObject = {} as any;

        if (
          Object.keys(samlResult.saml.hosted).length === 0 &&
          Object.keys(samlResult.saml.remote).length > 0
        ) {
          const remoteTemp = Object.values(samlResult.saml.remote)[0];

          if (samlProvider.replacements) {
            saveObject.config = replaceAllInJson(
              remoteTemp,
              samlProvider.replacements
            );
          } else {
            saveObject.config = remoteTemp;
          }
          fileDirectory = `realms/${realm}/realm-config/saml/remote`;
        } else if (
          Object.keys(samlResult.saml.remote).length === 0 &&
          Object.keys(samlResult.saml.hosted).length > 0
        ) {
          const hostedTemp = Object.values(samlResult.saml.hosted)[0];

          if (samlProvider.replacements) {
            saveObject.config = replaceAllInJson(
              hostedTemp,
              samlProvider.replacements
            );
          } else {
            saveObject.config = hostedTemp;
          }
          fileDirectory = `realms/${realm}/realm-config/saml/hosted`;
        }
        const metadata = Object.values(samlResult.saml.metadata)[0];
        const metaData = Array.isArray(metadata)
          ? metadata.join('\n')
          : metadata;
        saveObject.metadata = metaData;

        let fileName;
        if (samlProvider.fileName) {
          fileName = samlProvider.fileName;
        } else {
          fileName = safeFileNameUnderscore(samlProvider.entityId);
        }

        saveJsonToFile(
          saveObject,
          getFilePath(`${fileDirectory}/${fileName}.json`, true),
          false,
          true
        );
      }
      for (const cot of objects[realm].circlesOfTrust) {
        const cotResult = await exportCircleOfTrust(cot);
        const fileDirectory = `realms/${realm}/realm-config/saml/COT`;

        saveJsonToFile(
          cotResult.saml.cot[cot],
          getFilePath(`${fileDirectory}/${cot}.json`, true),
          false,
          true
        );
      }
    }
    return true;
  } catch (err) {
    printError(err, `Error exporting SAML`);
  }
  return false;
}
