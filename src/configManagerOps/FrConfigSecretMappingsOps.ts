import fs from 'fs';
import path from 'path';
import {
  frodo,
  state,
  type SecretStoreMappingSkeleton,
} from '@rockcarver/frodo-lib';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;
const {
  readSecretStoreMappings,
  updateSecretStoreMapping,
  deleteSecretStoreMapping,
  readSecretStoreMapping,
  deleteSecretStoreMappings,
} = frodo.secretStore;

const constants = frodo.utils.constants;
const { DEFAULT_REALM_KEY } = constants;

const ESV_SECRET_STORE_ID = 'ESV';
const ESV_SECRET_STORE_TYPE = 'GoogleSecretManagerSecretStoreProvider';

/**
 * Export all secret-mappings for ESV secret store
 * @param {string} name the name of the mapping to export
 * @param {string} realm the name of the realm to export from
 * @param {boolean} allowFailures True to succeed although some secret mappings could not be exported (the failures are still summarised)
 * @returns {Promise<boolean>} true if successful, false otherwise. A secret mapping or a realm that cannot be exported does not stop the others; the result is false if any failed, unless failures are allowed. A named secret mapping that exists in none of the realms fails the command whatever the option says; nothing to export is a success.
 */
export async function configManagerExportSecretMappings(
  name?,
  realm?,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'secret mapping', allowFailures });
    let found = false;
    for (const currentRealm of realms) {
      if (currentRealm === '/') continue;
      state.setRealm(currentRealm);
      let mappings: SecretStoreMappingSkeleton[];
      try {
        mappings = await readSecretStoreMappings(
          ESV_SECRET_STORE_ID,
          ESV_SECRET_STORE_TYPE,
          false
        );
      } catch (error) {
        printError(
          error,
          `Error reading the secret mappings of realm '${currentRealm}'`
        );
        run.recordFailure(`realm ${currentRealm}`, causeOf(error));
        continue;
      }
      for (const mapping of mappings) {
        if (name && name !== mapping._id) {
          continue;
        }
        found = true;
        try {
          const fileName = `realms/${currentRealm}/secret-mappings/${mapping._id}.json`;
          saveJsonToFile(mapping, getFilePath(fileName, true), false, true);
          run.recordSuccess();
        } catch (error) {
          printError(
            error,
            `Error exporting secret mapping '${mapping._id}' of realm '${currentRealm}'`
          );
          run.recordFailure(
            `${mapping._id} in realm ${currentRealm}`,
            causeOf(error)
          );
        }
      }
    }
    // a named secret mapping that is nowhere is not an operation that failed
    // among others: it fails the command whatever --allow-failures says
    const notFound = !!name && !found && !run.hasFailures;
    if (notFound) {
      printMessage(`Secret mapping '${name}' not found.`, 'error');
    }
    return run.finish() && !notFound;
  } catch (error) {
    printError(error, `Error exporting secret mappings`);
  }
  return false;
}

/**
 * Import all secret-mappings for ESV secret store
 * @param {string} name the name of the mapping to import
 * @param {string} realm the name of the realm to import to
 * @param {boolean} allowFailures True to succeed although some secret mappings could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} true if successful, false otherwise. A secret mapping that cannot be imported does not stop the others; the result is false if any failed, unless failures are allowed. A named realm without a secret-mappings folder, and a named secret mapping that is in no file, fail the command whatever the option says. A realm of the tenant without a folder has nothing to push and is skipped.
 */
export async function configManagerImportSecretMappings(
  name?: string,
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const named = !!realm && realm !== DEFAULT_REALM_KEY;
    const realms = named ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'secret mapping', allowFailures });
    let found = false;
    let missingNamedFolder = false;

    for (const currentRealm of realms) {
      if (currentRealm === '/') continue;

      state.setRealm(currentRealm);

      const dir = getFilePath(`realms/${currentRealm}/secret-mappings/`);
      if (!fs.existsSync(dir)) {
        if (named) {
          printMessage(
            `There is no secret-mappings folder for realm '${currentRealm}': expected '${dir}'.`,
            'error'
          );
          missingNamedFolder = true;
        } else {
          verboseMessage(
            `Skipping realm '${currentRealm}': no secret-mappings folder '${dir}'.`
          );
        }
        continue;
      }

      const configFiles = fs
        .readdirSync(dir)
        .filter((f) => path.extname(f) === '.json');

      for (const configFile of configFiles) {
        let label = configFile;
        try {
          const importData = readJsonFile(
            path.join(dir, configFile)
          ) as SecretStoreMappingSkeleton;
          label = importData._id ?? configFile;

          if (name && name !== importData._id) continue;
          found = true;

          delete importData._rev;

          await updateSecretStoreMapping(
            ESV_SECRET_STORE_ID,
            ESV_SECRET_STORE_TYPE,
            importData,
            false
          );
          run.recordSuccess();
        } catch (error) {
          printError(
            error,
            `Error importing secret mapping '${label}' of realm '${currentRealm}'`
          );
          run.recordFailure(
            `${label} in realm ${currentRealm}`,
            causeOf(error)
          );
        }
      }
    }
    // a named realm without its folder, or a named secret mapping that is in no
    // file, is not an operation that failed among others: it fails the command
    // whatever --allow-failures says
    const notFound =
      !!name && !found && !missingNamedFolder && !run.hasFailures;
    if (notFound) {
      printMessage(`Secret mapping '${name}' not found.`, 'error');
    }
    return run.finish() && !missingNamedFolder && !notFound;
  } catch (error) {
    printError(error, `Error importing secret mappings`);
    return false;
  }
}

/**
 * Delete secret mappings from the ESV secret store.
 * @param {string} name Optional exact mapping ID. If omitted, targets all mappings.
 * @param {string} realm Optional realm to target. If omitted, processes non-root realms.
 * @param {boolean} dryRun Show matching mappings without deleting them.
 * @param {boolean} allowFailures Allow individual deletion failures without failing the command.
 * @returns {Promise<boolean>} True if the run succeeds; false if it fails.
 */
export async function configManagerDeleteSecretMappings(
  name?: string,
  realm?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'secret mapping', allowFailures });
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    for (const currentRealm of realms) {
      if (currentRealm === '/') continue;
      state.setRealm(currentRealm);
      if (dryRun) {
        const mappings = name
          ? [
              await readSecretStoreMapping(
                ESV_SECRET_STORE_ID,
                ESV_SECRET_STORE_TYPE,
                name,
                false
              ),
            ]
          : await readSecretStoreMappings(
              ESV_SECRET_STORE_ID,
              ESV_SECRET_STORE_TYPE,
              false
            );
        if (mappings.length === 0) {
          printMessage(
            `No secret mappings found to delete in realm '${currentRealm}'.`,
            'warn'
          );
        }

        for (const mapping of mappings) {
          printMessage(
            `Dry run: Deleting secret ID mapping '${mapping._id}' in realm '${currentRealm}'`
          );
        }
      } else if (name) {
        try {
          await deleteSecretStoreMapping(
            ESV_SECRET_STORE_ID,
            ESV_SECRET_STORE_TYPE,
            name,
            false
          );
          run.recordSuccess();
          printMessage(
            `Deleting secret ID mapping '${name}' in realm '${currentRealm}'`
          );
        } catch (error) {
          printError(error);
          run.recordFailure(name, causeOf(error));
        }
      } else {
        const deletedMappings = await deleteSecretStoreMappings(
          ESV_SECRET_STORE_ID,
          ESV_SECRET_STORE_TYPE,
          false,
          (error, mapping) => {
            if (error) {
              printError(error);
              run.recordFailure(currentRealm, causeOf(error));
            } else if (mapping) {
              run.recordSuccess();
              printMessage(
                `Deleting secret ID mapping '${mapping._id}' in realm '${currentRealm}'`
              );
            }
          }
        );

        if (deletedMappings.length === 0) {
          printMessage(
            `No secret mappings found to delete in realm '${currentRealm}'.`,
            'warn'
          );
        }
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting secret mappings');
    run.finish();
    return false;
  }
}
