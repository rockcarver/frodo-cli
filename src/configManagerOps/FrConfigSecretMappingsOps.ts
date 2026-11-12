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
} = frodo.secretStore;

const constants = frodo.utils.constants;
const { DEFAULT_REALM_KEY } = constants;

const ESV_SECRET_STORE_ID = 'ESV';
const ESV_SECRET_STORE_TYPE = 'GoogleSecretManagerSecretStoreProvider';
/** The root realm, which has no secret mappings (the mappings of the secret store are kept per realm). */
const ROOT_REALM = '/';

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
 * @param {string} name Optional exact mapping ID. If omitted, targets all mappings. An empty ID is an error, never "all".
 * @param {string} realm Optional realm to target. If omitted, processes every realm but the root realm. The root realm is an error: it has no secret mappings to delete.
 * @param {boolean} dryRun Show matching mappings without deleting them.
 * @param {boolean} allowFailures Allow individual deletion failures without failing the command.
 * @returns {Promise<boolean>} True if the run succeeds. False if the arguments are refused, if the realms cannot be listed, or, unless failures are allowed, if a mapping could not be deleted, a named mapping does not exist, or the mappings of a realm could not be read. A mapping or a realm that fails does not stop the others. Nothing to delete is a success.
 */
export async function configManagerDeleteSecretMappings(
  name?: string,
  realm?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty ID must never
  // select every mapping
  const named = name !== undefined;
  if (named && name.trim() === '') {
    printMessage(
      'The secret mapping ID must not be empty. To delete all secret mappings, leave out the ID.',
      'error'
    );
    return false;
  }
  if (realm === ROOT_REALM) {
    printMessage(
      'The root realm has no secret mappings to delete. Name a realm such as alpha, or leave the realm out to use every realm except the root realm.',
      'error'
    );
    return false;
  }
  const run = new OperationRun({ unit: 'secret mapping', allowFailures });
  // the realm is set per realm below; the caller (for example the question of
  // the bulk-delete guard, which names the realm) must find it as it was
  const realmBefore = state.getRealm();
  try {
    let realms: string[];
    try {
      realms =
        realm && realm !== DEFAULT_REALM_KEY
          ? [realm]
          : (await realmList()).filter((r) => r !== ROOT_REALM);
    } catch (error) {
      printError(error, 'Error reading realms');
      return false;
    }
    if (realms.length === 0) {
      printMessage('No realms found to delete secret mappings from.', 'warn');
      return true;
    }
    for (const currentRealm of realms) {
      state.setRealm(currentRealm);
      // a named mapping is deleted with one request, without reading first
      if (named && !dryRun) {
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
        continue;
      }
      let mappings: SecretStoreMappingSkeleton[];
      try {
        mappings = named
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
      } catch (error) {
        // a realm whose mappings cannot be read does not stop the other realms
        printError(error);
        run.recordFailure(named ? name : currentRealm, causeOf(error));
        continue;
      }
      if (mappings.length === 0) {
        printMessage(
          `No secret mappings found to delete in realm '${currentRealm}'.`,
          'warn'
        );
        continue;
      }
      for (const mapping of mappings) {
        if (dryRun) {
          printMessage(
            `Dry run: Deleting secret ID mapping '${mapping._id}' in realm '${currentRealm}'`
          );
          continue;
        }
        try {
          await deleteSecretStoreMapping(
            ESV_SECRET_STORE_ID,
            ESV_SECRET_STORE_TYPE,
            mapping._id,
            false
          );
          run.recordSuccess();
          printMessage(
            `Deleting secret ID mapping '${mapping._id}' in realm '${currentRealm}'`
          );
        } catch (error) {
          // the error of the library names the mapping and the realm, so no
          // message of our own: the failure is printed once
          printError(error);
          run.recordFailure(mapping._id, causeOf(error));
        }
      }
    }
    return run.finish();
  } finally {
    state.setRealm(realmBefore);
  }
}
