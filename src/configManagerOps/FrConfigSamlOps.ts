import fs from 'fs';
import {
  frodo,
  state,
  type CircleOfTrustSkeleton,
  type CirclesOfTrustExportInterface,
  type Saml2ExportInterface,
  type Saml2ProviderSkeleton,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import {
  escapePlaceholders,
  replaceAllInJson,
  safeFileNameUnderscore,
} from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const { CLOUD_DEPLOYMENT_TYPE_KEY, DEFAULT_REALM_KEY } = frodo.utils.constants;
const { exportSaml2Provider, importSaml2Providers } =
  frodo.saml2.entityProvider;
const { exportCircleOfTrust, importCirclesOfTrust } =
  frodo.saml2.circlesOfTrust;

type Saml2PullExportInterface = {
  config: Saml2ProviderSkeleton;
  metadata: string;
};

/**
 * Export SAML configurations in fr-config-manager format.
 * @param {string} file File that determines what SAML config is exported
 * @param {boolean} allowFailures True to succeed although some providers or circles of trust could not be exported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise. A provider or a circle of trust that cannot be exported does not stop the others; the result is false if any failed, unless failures are allowed. A file that does not exist, or that cannot be read, is a failure.
 */
export async function configManagerExportSaml(
  file: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    if (!fs.existsSync(file)) {
      printMessage(`The SAML config file '${file}' does not exist.`, 'error');
      return false;
    }
    const objects = JSON.parse(fs.readFileSync(file, 'utf8'));
    const run = new OperationRun({ unit: 'item', allowFailures });
    for (const realm of Object.keys(objects)) {
      if (
        realm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      const realmDir = realm === '/' ? 'root' : realm;
      for (const samlProvider of objects[realm].samlProviders ?? []) {
        try {
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
          run.recordSuccess();
        } catch (error) {
          printError(
            error,
            `Error exporting SAML provider '${samlProvider.entityId}' of realm '${realm}'`
          );
          run.recordFailure(
            `provider ${samlProvider.entityId} in realm ${realm}`,
            causeOf(error)
          );
        }
      }
      for (const cot of objects[realm].circlesOfTrust ?? []) {
        try {
          const cotResult = await exportCircleOfTrust(cot);
          const fileDirectory = `realms/${realmDir}/realm-config/saml/COT`;

          saveJsonToFile(
            cotResult.saml.cot[cot],
            getFilePath(`${fileDirectory}/${cot}.json`, true),
            false,
            true
          );
          run.recordSuccess();
        } catch (error) {
          printError(
            error,
            `Error exporting circle of trust '${cot}' of realm '${realm}'`
          );
          run.recordFailure(
            `circle of trust ${cot} in realm ${realm}`,
            causeOf(error)
          );
        }
      }
    }
    return run.finish();
  } catch (err) {
    printError(err, `Error exporting SAML`);
  }
  return false;
}

/**
 * Import SAML configuration that was exported in config-manager format
 * @param {string} realm name of realm to import SAML entity
 * @param {string} entityName option parameter to import SAML entity by name
 * @param {boolean} allowFailures True to succeed although some providers or circles of trust could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} true if successful, false otherwise. A provider, a circle of trust or a file that cannot be imported does not stop the others; the result is false if any failed, unless failures are allowed. A named SAML entity that is in no file, a named realm without SAML config, and a config folder without a realms folder fail the command whatever the option says.
 */
export async function configManagerImportSaml(
  realm?: string,
  entityName?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    'Importing SAML configuration...'
  );
  try {
    const named = !!realm && realm !== DEFAULT_REALM_KEY;
    const realmsDir = `${getWorkingDirectory()}/realms`;
    let realmsToProcess: string[];
    if (named) {
      realmsToProcess = [realm];
    } else {
      if (!fs.existsSync(realmsDir)) {
        stopProgressIndicator(
          indicatorId,
          `There is no 'realms' folder in '${getWorkingDirectory()}', so there is no SAML configuration to push.`,
          'fail'
        );
        return false;
      }
      realmsToProcess = fs
        .readdirSync(realmsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    }

    if (entityName && realmsToProcess.length !== 1) {
      stopProgressIndicator(
        indicatorId,
        'For a named SAML entity, specify a single realm.',
        'fail'
      );
      return false;
    }

    const run = new OperationRun({ unit: 'item', allowFailures });
    let entityFound = false;
    let missingNamedConfig = false;

    for (const currentRealm of realmsToProcess) {
      const isRootRealm = currentRealm === 'root' || currentRealm === '/';
      if (
        isRootRealm &&
        state.getDeploymentType() === CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(isRootRealm ? '/' : currentRealm);
      const samlDir = `${getWorkingDirectory()}/realms/${isRootRealm ? 'root' : currentRealm}/realm-config/saml`;
      const hostedDir = `${samlDir}/hosted`;
      const remoteDir = `${samlDir}/remote`;
      const cotDir = `${samlDir}/COT`;

      if (named && !fs.existsSync(samlDir)) {
        printMessage(
          `There is no SAML config for realm '${currentRealm}': expected the folder '${samlDir}'.`,
          'error'
        );
        missingNamedConfig = true;
        continue;
      }

      const matchesName = (dir: string, file: string): boolean => {
        if (!entityName) return true;
        const samlData = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
        return (
          samlData._id === entityName ||
          samlData.config?.entityId === entityName
        );
      };

      // Hosted providers first, then remote ones, as the library imports them.
      for (const [location, dir] of [
        ['hosted', hostedDir],
        ['remote', remoteDir],
      ] as const) {
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          if (!file.endsWith('.json')) continue;
          let label = file;
          try {
            if (!matchesName(dir, file)) continue;
            entityFound = true;
            const providerData = readJsonFile(
              `${dir}/${file}`
            ) as Saml2PullExportInterface;
            const entityId = providerData.config.entityId;
            label = entityId;
            const samlConfig: Saml2ExportInterface['saml'] = {
              hosted: {},
              remote: {},
              metadata: { [entityId]: [providerData.metadata] },
            };
            samlConfig[location][entityId] = providerData.config;
            await importSaml2Providers(
              { script: {}, saml: samlConfig },
              { deps: false }
            );
            run.recordSuccess();
          } catch (error) {
            printError(
              error,
              `Error importing SAML provider '${label}' of realm '${currentRealm}'`
            );
            run.recordFailure(
              `provider ${label} in realm ${currentRealm}`,
              causeOf(error)
            );
          }
        }
      }

      const cots: Record<string, CircleOfTrustSkeleton> = {};
      if (fs.existsSync(cotDir)) {
        for (const file of fs.readdirSync(cotDir)) {
          if (!file.endsWith('.json')) continue;
          try {
            const cotData = readJsonFile(
              `${cotDir}/${file}`
            ) as CircleOfTrustSkeleton;
            cots[cotData._id] = cotData;
          } catch (error) {
            printError(
              error,
              `Error reading circle of trust file '${file}' of realm '${currentRealm}'`
            );
            run.recordFailure(
              `circle of trust file ${file} in realm ${currentRealm}`,
              causeOf(error)
            );
          }
        }
      }

      const cotCount = Object.keys(cots).length;
      if (cotCount > 0) {
        const cotImportData: CirclesOfTrustExportInterface = {
          script: {},
          saml: { hosted: {}, remote: {}, metadata: {}, cot: cots },
        };
        try {
          await importCirclesOfTrust(cotImportData);
          for (let i = 0; i < cotCount; i++) run.recordSuccess();
        } catch (error) {
          printError(
            error,
            `Error importing the circles of trust of realm '${currentRealm}'`
          );
          run.recordCombinedError(error, {
            total: cotCount,
            fallbackName: `circles of trust in realm ${currentRealm}`,
          });
        }
      }
    }

    const notFound =
      !!entityName && !entityFound && !missingNamedConfig && !run.hasFailures;
    if (notFound) {
      printMessage(
        `SAML entity '${entityName}' not found in the SAML config of realm ${realmsToProcess[0]}.`,
        'error'
      );
    }

    const failed = run.hasFailures || missingNamedConfig || notFound;
    if (failed) {
      stopProgressIndicator(
        indicatorId,
        'SAML import finished with errors.',
        'fail'
      );
    } else {
      stopProgressIndicator(indicatorId, 'SAML import completed.', 'success');
    }
    // a named realm without SAML config, or a named SAML entity that is in no
    // file, is not an operation that failed among others: it fails the command
    // whatever --allow-failures says
    return run.finish() && !missingNamedConfig && !notFound;
  } catch (error) {
    stopProgressIndicator(indicatorId, 'SAML import failed.', 'fail');
    printError(error, 'Error importing SAML configuration');
  }
  return false;
}
