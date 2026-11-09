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
  objectNameInFile,
  ownedObjectMessage,
  OwnedObjects,
  skipsOwnedObjects,
} from '../ops/ApplicationOwnedObjects';
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
import type { ApplicationLayoutDecision } from '../utils/TreeLayout';

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
 * Write one circle of trust in config-manager format:
 * `realms/<realm>/realm-config/saml/COT/<id>.json`. Shared by `pull saml` and
 * by the commands that pull a circle of trust because an application uses it.
 * @param {string} cotId id of the circle of trust
 * @param {string} realm the realm of the circle of trust (`/` is written as `root`); it must be the current realm of the state
 * @throws {FrodoError} if the circle of trust cannot be read or its file cannot be written
 */
export async function exportCircleOfTrustToFile(
  cotId: string,
  realm: string
): Promise<void> {
  const cotResult = await exportCircleOfTrust(cotId);
  const realmDir = realm === '/' ? 'root' : realm;
  const fileDirectory = `realms/${realmDir}/realm-config/saml/COT`;
  saveJsonToFile(
    cotResult.saml.cot[cotId],
    getFilePath(`${fileDirectory}/${cotId}.json`, true),
    false,
    true
  );
}

/**
 * Read one SAML provider in the shape of the files of config-manager: the
 * configuration of the hosted or remote provider and its metadata. Placeholders
 * in the content are escaped (`${` stays literal), as `pull saml` does.
 * @param {string} entityId entity id of the provider
 * @returns {Promise<{ location: 'hosted' | 'remote'; config: Saml2ProviderSkeleton; metadata: string }>} where the provider lives, its configuration and its metadata
 * @throws {FrodoError} if the provider cannot be exported, or is neither hosted nor remote
 */
export async function readSamlProviderForFile(entityId: string): Promise<{
  location: 'hosted' | 'remote';
  config: Saml2ProviderSkeleton;
  metadata: string;
}> {
  const result = escapePlaceholders(
    await exportSaml2Provider(entityId, { deps: false })
  );
  const hosted = Object.values(result.saml.hosted);
  const remote = Object.values(result.saml.remote);
  if (hosted.length === 0 && remote.length === 0) {
    throw new Error(
      `SAML provider ${entityId} is neither a hosted nor a remote provider.`
    );
  }
  const metadata = Object.values(result.saml.metadata)[0];
  return {
    location: hosted.length > 0 ? 'hosted' : 'remote',
    config: (hosted.length > 0
      ? hosted[0]
      : remote[0]) as Saml2ProviderSkeleton,
    metadata: Array.isArray(metadata) ? metadata.join('\n') : metadata,
  };
}

/**
 * Export SAML configurations in fr-config-manager format.
 * In a tree that uses the application layout (decision record 0042) a provider that an
 * application owns is not exported here: `pull applications` writes it into the folder of the
 * application. It is named and skipped, which is not a failure, and the config file is not
 * changed. The circles of trust are shared and are always exported. A realm whose applications
 * cannot be read is one failed operation, and its providers are not exported.
 * @param {string} file File that determines what SAML config is exported
 * @param {boolean} allowFailures True to succeed although some providers or circles of trust could not be exported (the failures are still summarised)
 * @param {ApplicationLayoutDecision} layout The layout of the tree, when `pull all` has decided it before its first step; default: read from the marker of the tree
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise. A provider or a circle of trust that cannot be exported does not stop the others; the result is false if any failed, unless failures are allowed. A file that does not exist, or that cannot be read, is a failure.
 */
export async function configManagerExportSaml(
  file: string,
  allowFailures: boolean = false,
  layout?: ApplicationLayoutDecision
): Promise<boolean> {
  try {
    if (!fs.existsSync(file)) {
      printMessage(`The SAML config file '${file}' does not exist.`, 'error');
      return false;
    }
    const objects = JSON.parse(fs.readFileSync(file, 'utf8'));
    const run = new OperationRun({ unit: 'item', allowFailures });
    const owned = skipsOwnedObjects(layout) ? new OwnedObjects() : undefined;
    for (const realm of Object.keys(objects)) {
      if (
        realm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      )
        continue;
      state.setRealm(realm);
      const realmDir = realm === '/' ? 'root' : realm;
      let ownershipKnown = true;
      if (owned) {
        try {
          await owned.loadCurrentRealm();
        } catch (error) {
          printError(
            error,
            `Error reading the applications of realm '${realm}'`
          );
          run.recordFailure(`ownership of realm ${realmDir}`, causeOf(error));
          ownershipKnown = false;
        }
      }
      for (const samlProvider of ownershipKnown
        ? (objects[realm].samlProviders ?? [])
        : []) {
        const owners = owned
          ? owned.ownersInCurrentRealm('saml2Provider', samlProvider.entityId)
          : [];
        if (owners.length > 0) {
          printMessage(
            ownedObjectMessage('saml2Provider', samlProvider.entityId, owners),
            'info'
          );
          continue;
        }
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
          await exportCircleOfTrustToFile(cot, realm);
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
 * Import one SAML provider from the content of a file of config-manager format
 * (`{ config, metadata }`, as `pull saml` and `pull applications` write it).
 * Shared by the commands that push a provider because an application owns it.
 * @param {Saml2PullExportInterface} file the configuration of the provider and its metadata
 * @param {'hosted' | 'remote'} location where the provider lives
 * @throws {FrodoError} if the provider cannot be imported
 */
export async function importSamlProviderFromFile(
  file: { config: Saml2ProviderSkeleton; metadata: string },
  location: 'hosted' | 'remote'
): Promise<void> {
  const entityId = file.config.entityId;
  const saml: Saml2ExportInterface['saml'] = {
    hosted: {},
    remote: {},
    metadata: { [entityId]: [file.metadata] },
  };
  saml[location][entityId] = file.config;
  await importSaml2Providers({ script: {}, saml }, { deps: false });
}

/**
 * Find the circles of trust in the files of a realm that have one of the given
 * providers as a member.
 * @param {string} realm the realm of the circles of trust (`/` is read from `root`)
 * @param {string[]} entityIds entity ids of SAML providers
 * @returns {string[]} the ids of the circles of trust, sorted; none if the realm has no circle of trust files
 * @throws {FrodoError} if a circle of trust file cannot be read
 */
export function findCirclesOfTrustOfProviders(
  realm: string,
  entityIds: string[]
): string[] {
  const realmDir = realm === '/' ? 'root' : realm;
  const cotDir = `${getWorkingDirectory()}/realms/${realmDir}/realm-config/saml/COT`;
  if (!fs.existsSync(cotDir)) return [];
  const members = new Set(entityIds.map((id) => `${id}|saml2`.toLowerCase()));
  const found: string[] = [];
  for (const file of fs.readdirSync(cotDir).sort()) {
    if (!file.endsWith('.json')) continue;
    const cot = readJsonFile(`${cotDir}/${file}`) as CircleOfTrustSkeleton;
    if (
      (cot.trustedProviders ?? []).some((member) =>
        members.has(String(member).toLowerCase())
      )
    ) {
      found.push(cot._id);
    }
  }
  return found;
}

/**
 * Import one circle of trust from its file,
 * `realms/<realm>/realm-config/saml/COT/<id>.json`. The library adds the members
 * of the file to the circle that exists (it never removes one) and ignores
 * members that are not providers of the tenant, so import the providers first.
 * @param {string} cotId id of the circle of trust
 * @param {string} realm the realm of the circle of trust (`/` is read from `root`); it must be the current realm of the state
 * @throws {FrodoError} if the file cannot be read or the circle of trust cannot be imported
 */
export async function importCircleOfTrustFromFile(
  cotId: string,
  realm: string
): Promise<void> {
  const realmDir = realm === '/' ? 'root' : realm;
  const cot = readJsonFile(
    `${getWorkingDirectory()}/realms/${realmDir}/realm-config/saml/COT/${cotId}.json`
  ) as CircleOfTrustSkeleton;
  await importCirclesOfTrust({
    script: {},
    saml: { hosted: {}, remote: {}, metadata: {}, cot: { [cot._id]: cot } },
  });
}

/**
 * Import SAML configuration that was exported in config-manager format
 * In a tree that uses the application layout (decision record 0042) a provider that an application
 * owns is not imported here: `push applications` imports it from the folder of the application. The
 * application folders of the realm tell which providers those are; a provider file that one of them
 * owns is named and skipped, which is not a failure (a named entity that is skipped for that reason
 * counts as found), and no file of the tree is changed. The circles of trust are shared and are
 * always imported. A realm whose application folders cannot be read is one failed operation, and its
 * providers are not imported.
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
    const owned = skipsOwnedObjects() ? new OwnedObjects() : undefined;
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

      let ownershipKnown = true;
      if (owned && (fs.existsSync(hostedDir) || fs.existsSync(remoteDir))) {
        try {
          owned.loadRealmOfTree(
            getWorkingDirectory(),
            isRootRealm ? '/' : currentRealm
          );
        } catch (error) {
          printError(
            error,
            `Error reading the application folders of realm '${currentRealm}'`
          );
          run.recordFailure(
            `application folders of realm ${currentRealm}`,
            causeOf(error)
          );
          ownershipKnown = false;
        }
      }

      // Hosted providers first, then remote ones, as the library imports them.
      for (const [location, dir] of [
        ['hosted', hostedDir],
        ['remote', remoteDir],
      ] as const) {
        if (!fs.existsSync(dir) || !ownershipKnown) continue;
        for (const file of fs.readdirSync(dir)) {
          if (!file.endsWith('.json')) continue;
          let label = file;
          try {
            if (!matchesName(dir, file)) continue;
            entityFound = true;
            if (owned) {
              const entityId = objectNameInFile(
                `${dir}/${file}`,
                (content) => content?.config?.entityId,
                file.slice(0, -'.json'.length)
              );
              const owners = owned.ownersInCurrentRealm(
                'saml2Provider',
                entityId
              );
              if (owners.length > 0) {
                printMessage(
                  ownedObjectMessage(
                    'saml2Provider',
                    entityId,
                    owners,
                    false,
                    'pushed'
                  ),
                  'info'
                );
                continue;
              }
            }
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
