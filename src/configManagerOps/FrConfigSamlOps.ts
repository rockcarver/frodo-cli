import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import { CirclesOfTrustExportInterface } from '@rockcarver/frodo-lib/types/ops/CirclesOfTrustOps';
import { Saml2ExportInterface } from '@rockcarver/frodo-lib/types/ops/Saml2Ops';
import fs from 'fs';

import { printError } from '../utils/Console';
import {
  escapePlaceholders,
  replaceAllInJson,
  safeFileNameUnderscore,
} from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const { exportSaml2Provider, importSaml2Providers } =
  frodo.saml2.entityProvider;
const { exportCircleOfTrust, importCirclesOfTrust } =
  frodo.saml2.circlesOfTrust;
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

/**
 * Import all SAML entity providers from all *.saml.json files in the current directory
 * @param {string} entityName option parameter to import SAML entity by name  
 * @returns {Promise<boolean>} true if successful, false otherwise
 */

export async function configManagerImportSaml(
  entityName?: string,
): Promise<boolean> {
  try {
    const realmsDir = getFilePath('realms/');
    const realmsToProcess = fs
      .readdirSync(realmsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    if (entityName) {
      const realmsWithSaml = realmsToProcess.filter((realm) =>
        fs.existsSync(getFilePath(`realms/${realm}/realm-config/saml`))
      );
      if (realmsWithSaml.length > 1) {
        throw new FrodoError(
          `For a named SAML entity, with only a single realm may contain SAML config`
        );
      }
    }

    for (const realm of realmsToProcess) {
      state.setRealm(realm);
      if (state.getRealm() === '/') continue;
      const samlDir = getFilePath(`realms/${realm}/realm-config/saml`);

      const hostedDir = `${samlDir}/hosted`;
      const remoteDir = `${samlDir}/remote`;
      const cotDir = `${samlDir}/COT`;

      const hosted: Record<string, any> = {};
      const remote: Record<string, any> = {};
      const metadata: Record<string, string[]> = {};
      const cot: Record<string, any> = {};

      if (fs.existsSync(hostedDir)) {
        for (const file of fs.readdirSync(hostedDir)) {
          if (file.endsWith('.json')) {
            const hostedData = readJsonFile(`${hostedDir}/${file}`) as any;
            if (entityName && hostedData.config.entityID !== entityName)
              continue;

            hosted[hostedData.config.entityId] = hostedData.config;
            metadata[hostedData.config.entityId] = [hostedData.metadata];
          }
        }
      }

      if (fs.existsSync(remoteDir)) {
        for (const file of fs.readdirSync(remoteDir)) {
          if (file.endsWith('.json')) {
            const remoteData = readJsonFile(`${remoteDir}/${file}`) as any;
            if (entityName && remoteData.config.entityId !== entityName)
              continue;
            remote[remoteData.config.entityId] = remoteData.config;
            metadata[remoteData.config.entityId] = [remoteData.metadata];
          }
        }
      }

      if (fs.existsSync(cotDir)) {
        for (const file of fs.readdirSync(cotDir)) {
          if (file.endsWith('.json')) {
            const cotData = readJsonFile(`${cotDir}/${file}`) as any;
            if (entityName && cotData._id !== entityName) continue;
            cot[cotData._id] = cotData;
          }
        }
      }

      const hasProviders =
        Object.keys(hosted).length > 0 || Object.keys(remote).length > 0;

      const hasCot = Object.keys(cot).length > 0;

      if (hasProviders) {
        const samlImportData: Saml2ExportInterface = {
          script: {},
          saml: { hosted, remote, metadata },
        };
        await importSaml2Providers(samlImportData);
      }

      if (hasCot) {
        const cotImportData: CirclesOfTrustExportInterface = {
          script: {},
          saml: { hosted: {}, remote: {}, metadata: {}, cot },
        };
        await importCirclesOfTrust(cotImportData);
      }
    }

    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}
