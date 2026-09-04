import { frodo, state } from '@rockcarver/frodo-lib';
import { CircleOfTrustSkeleton } from '@rockcarver/frodo-lib/types/api/CirclesOfTrustApi';
import { Saml2ProviderSkeleton } from '@rockcarver/frodo-lib/types/api/Saml2Api';
import { CirclesOfTrustExportInterface } from '@rockcarver/frodo-lib/types/ops/CirclesOfTrustOps';
import { Saml2ExportInterface } from '@rockcarver/frodo-lib/types/ops/Saml2Ops';
import fs from 'fs';

import {
  createProgressIndicator,
  printError,
  stopProgressIndicator,
} from '../utils/Console';
import {
  escapePlaceholders,
  replaceAllInJson,
  safeFileNameUnderscore,
} from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { CLOUD_DEPLOYMENT_TYPE_KEY, DEFAULT_REALM_KEY} = frodo.utils.constants;
const { exportSaml2Provider, importSaml2Providers } =
  frodo.saml2.entityProvider;
const { exportCircleOfTrust, importCirclesOfTrust } =
  frodo.saml2.circlesOfTrust;

type Saml2PullExportInterface = {
  config: Saml2ProviderSkeleton;
  metadata: string;
};

/**
 * Export an IDM configuration object in the fr-config-manager format.
 * @param {string} file File that determines what SAML config is exported
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportSaml(file): Promise<boolean> {
  try {
    const objects = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const realm of Object.keys(objects)) {
      state.setRealm(realm);
      if (
        realm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      const realmDir = realm === '/' ? 'root' : realm;
      for (const samlProvider of objects[realm].samlProviders) {
        const result = await exportSaml2Provider(samlProvider.entityId, {
          deps: false,
        });
        const samlResult = escapePlaceholders(result);
        let fileDirectory = `realms/${realmDir}/realm-config/saml`;
        const saveObject = {} as Saml2PullExportInterface;

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
          fileDirectory = `realms/${realmDir}/realm-config/saml/remote`;
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
          fileDirectory = `realms/${realmDir}/realm-config/saml/hosted`;
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
        const fileDirectory = `realms/${realmDir}/realm-config/saml/COT`;

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
 * @param {string} realm name of realm to import SAML entity
 * @returns {Promise<boolean>} true if successful, false otherwise
 */

export async function configManagerImportSaml(
  realm?: string,
  entityName?: string
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing SAML configuration...'
  );
  try {
    const realmsDir = `${getWorkingDirectory()}/realms`;
    const realmsToProcess = realm && realm !== DEFAULT_REALM_KEY
      ? [realm]
      : fs
          .readdirSync(realmsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);

    if (entityName && realmsToProcess.length !== 1) {
      stopProgressIndicator(
        indicatorId,
        'For a named SAML entity, specify a single realm.',
        'fail'
      );
      return false;
    }

    for (const realm of realmsToProcess) {
      const isRootRealm = realm === 'root' || realm === '/';
      if (isRootRealm && state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY)
        continue;
      state.setRealm(isRootRealm ? '/' : realm);
      const samlDir = `${getWorkingDirectory()}/realms/${isRootRealm ? 'root' : realm}/realm-config/saml`;
      const hostedDir = `${samlDir}/hosted`;
      const remoteDir = `${samlDir}/remote`;
      const cotDir = `${samlDir}/COT`;

      const samlConfig: {
        hosted: Record<string, Saml2ProviderSkeleton>;
        remote: Record<string, Saml2ProviderSkeleton>;
        metadata: Record<string, string[]>;
        cot: Record<string, CircleOfTrustSkeleton>;
      } = {
        hosted: {},
        remote: {},
        metadata: {},
        cot: {},
      };

      if (fs.existsSync(hostedDir)) {
        fs.readdirSync(hostedDir)
          .filter((file) => {
            if (!file.endsWith('.json')) return false;
            if (!entityName) return true;
            const samlData = JSON.parse(
              fs.readFileSync(`${hostedDir}/${file}`, 'utf8')
            );
            return (
              (samlData._id && samlData._id === entityName) ||
              (samlData.config && samlData.config.entityId === entityName)
            );
          })
          .forEach((file) => {
            const hostedData = readJsonFile(
              `${hostedDir}/${file}`
            ) as Saml2PullExportInterface;
            samlConfig.hosted[hostedData.config.entityId] = hostedData.config;
            samlConfig.metadata[hostedData.config.entityId] = [
              hostedData.metadata,
            ];
          });
      }

      if (fs.existsSync(remoteDir)) {
        fs.readdirSync(remoteDir)
          .filter((file) => {
            if (!file.endsWith('.json')) return false;
            if (!entityName) return true;
            const samlData = JSON.parse(
              fs.readFileSync(`${remoteDir}/${file}`, 'utf8')
            );
            return (
              (samlData._id && samlData._id === entityName) ||
              (samlData.config && samlData.config.entityId === entityName)
            );
          })
          .forEach((file) => {
            const remoteData = readJsonFile(
              `${remoteDir}/${file}`
            ) as Saml2PullExportInterface;
            samlConfig.remote[remoteData.config.entityId] = remoteData.config;
            samlConfig.metadata[remoteData.config.entityId] = [
              remoteData.metadata,
            ];
          });
      }

      const hasProviders =
        Object.keys(samlConfig.hosted).length > 0 ||
        Object.keys(samlConfig.remote).length > 0;

      if (hasProviders) {
        const samlImportData: Saml2ExportInterface = {
          script: {},
          saml: samlConfig,
        };
        await importSaml2Providers(samlImportData, {
          deps: false,
        });
      }

      if (fs.existsSync(cotDir)) {
        for (const file of fs.readdirSync(cotDir)) {
          if (!file.endsWith('.json')) continue;
          const cotData = readJsonFile(
            `${cotDir}/${file}`
          ) as CircleOfTrustSkeleton;
          samlConfig.cot[cotData._id] = cotData;
        }
      }

      const hasCot = Object.keys(samlConfig.cot).length > 0;

      if (hasCot) {
        const cotImportData: CirclesOfTrustExportInterface = {
          script: {},
          saml: samlConfig,
        };
        await importCirclesOfTrust(cotImportData);
      }
    }
    stopProgressIndicator(indicatorId, 'SAML import completed.', 'success');
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'SAML import failed.', 'fail');
    printError(error, 'Error importing SAML configuration');
  }
  return false;
}
