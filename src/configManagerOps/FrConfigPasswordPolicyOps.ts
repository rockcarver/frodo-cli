import fs from 'fs';
import { frodo, state } from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { realmList } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { DEFAULT_REALM_KEY } = frodo.utils.constants;
const { getFilePath, saveJsonToFile, getWorkingDirectory, readJsonFile } =
  frodo.utils;
const { readConfigEntity, importConfigEntities } = frodo.idm.config;

/**
 * Export IDM password policy configuration object in the fr-config-manager format.
 * @param {string} realm Defines a specific realm to pull password-policy config from
 * @param {boolean} allowFailures True to succeed although some realms could not be exported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise. A realm that cannot be exported does not stop the others; the result is false if any failed, unless failures are allowed. Nothing to export is a success.
 */
export async function configManagerExportPasswordPolicy(
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const realms =
      realm && realm !== DEFAULT_REALM_KEY ? [realm] : await realmList();
    const run = new OperationRun({ unit: 'realm', allowFailures });
    for (const currentRealm of realms) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      try {
        const objectName = `${currentRealm === '/' ? '' : `${currentRealm}_`}user`;
        const passwordPolicy = await readConfigEntity(
          `fieldPolicy/${objectName}`
        );
        const fileName = `realms/${currentRealm === '/' ? 'root' : currentRealm}/password-policy/${objectName}-password-policy.json`;
        saveJsonToFile(
          passwordPolicy,
          getFilePath(fileName, true),
          false,
          true
        );
        run.recordSuccess();
      } catch (error) {
        printError(
          error,
          `Error exporting the password policy of realm '${currentRealm}'`
        );
        run.recordFailure(currentRealm, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting password policies`);
  }
  return false;
}

/**
 * Import IDM password policy configuration object from fr-config-manager export.
 * @param {string} realm the realm to import into
 * @param {boolean} allowFailures True to succeed although some realms could not be imported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise. A realm that cannot be imported does not stop the others; the result is false if any failed, unless failures are allowed. A named realm without a password policy file, or a config folder without a realms folder, fails the command whatever the option says; a realm folder without the file is skipped with a warning.
 */
export async function configManagerImportPasswordPolicy(
  realm?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    printMessage('Updating password policy');
    const named = !!realm && realm !== DEFAULT_REALM_KEY;
    let realms: string[];
    if (named) {
      realms = [realm];
    } else {
      const realmsDir = `${getWorkingDirectory()}/realms`;
      if (!fs.existsSync(realmsDir)) {
        printMessage(
          `There is no 'realms' folder in '${getWorkingDirectory()}', so there are no password policies to push.`,
          'error'
        );
        return false;
      }
      realms = fs
        .readdirSync(realmsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => (entry.name === 'root' ? '/' : entry.name));
    }
    const run = new OperationRun({ unit: 'realm', allowFailures });
    let missingNamedFile = false;
    for (const currentRealm of realms) {
      if (
        currentRealm === '/' &&
        state.getDeploymentType() ===
          frodo.utils.constants.CLOUD_DEPLOYMENT_TYPE_KEY
      ) {
        continue;
      }
      const objectName = `${currentRealm === '/' ? '' : `${currentRealm}_`}user`;
      const filePath = getFilePath(
        `realms/${currentRealm === '/' ? 'root' : currentRealm}/password-policy/${objectName}-password-policy.json`
      );
      if (!fs.existsSync(filePath)) {
        if (named) {
          printMessage(
            `There is no password policy file for realm '${currentRealm}': expected '${filePath}'.`,
            'error'
          );
          missingNamedFile = true;
        } else {
          printMessage(
            `Skipping realm '${currentRealm}': no password policy file '${filePath}'.`,
            'warn'
          );
        }
        continue;
      }
      try {
        const parsedData = readJsonFile(filePath) as any;
        // Support both fr-config wrappers ({ idm: { ... }, meta: ... }) and
        // single-entity files with a top-level _id.
        if (
          parsedData?.idm &&
          typeof parsedData.idm === 'object' &&
          Object.keys(parsedData.idm).length > 0
        ) {
          await importConfigEntities({ idm: parsedData.idm });
        } else {
          if (!parsedData?._id) {
            throw new Error(
              `Invalid password policy payload in '${filePath}': expected either an 'idm' map or top-level '_id'.`
            );
          }
          await importConfigEntities({
            idm: { [parsedData._id]: parsedData },
          });
        }
        run.recordSuccess();
      } catch (error) {
        printError(
          error,
          `Error importing the password policy of realm '${currentRealm}'`
        );
        run.recordFailure(currentRealm, causeOf(error));
      }
    }
    // a named realm without its file is not an operation that failed among
    // others: it fails the command whatever --allow-failures says
    return run.finish() && !missingNamedFile;
  } catch (error) {
    printError(error, `Error importing password policies`);
  }
  return false;
}
