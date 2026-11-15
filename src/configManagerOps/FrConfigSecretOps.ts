import fs from 'fs';
import {
  frodo,
  type SecretSkeleton,
  type VersionOfSecretSkeleton,
} from '@rockcarver/frodo-lib';
import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { csvEscape, esvToEnv, friendlyTimestamp } from '../utils/FrConfig';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const {
  readSecrets,
  createSecret,
  createVersionOfSecret,
  readVersionsOfSecret,
  findVersionsToPrune,
  pruneVersionsOfSecret,
  deleteSecret,
} = frodo.cloud.secret;

/**
 * What `push secrets --prune` keeps besides the active version: nothing that is
 * loaded, but the deactivated versions. The preview and the prune take their
 * choice from here, so that they cannot differ.
 */
const PUSH_PRUNE_KEEP_LOADED = false;
const PUSH_PRUNE_KEEP_DEACTIVATED = true;

type FrConfigSecret = SecretSkeleton & {
  valueBase64: string;
};

/**
 * Export all secrets to individual files in fr-config-manager format. Every
 * secret is its own operation: one that cannot be exported is reported and does
 * not stop the others, and one summary names the secrets that failed. Secrets
 * that cannot be read fail the command whatever `allowFailures` says.
 * @param {boolean} activeOnly true to export only active secret versions, false to export all secrets versions
 * @param {boolean} report true to report in csv format
 * @param {boolean} allowFailures true to succeed although some secrets could not be exported (the failures are still summarised)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportSecrets(
  activeOnly?: boolean,
  report?: boolean,
  allowFailures: boolean = false
): Promise<boolean> {
  let secrets: FrConfigSecret[];
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading secrets...`
  );
  try {
    secrets = (await readSecrets()) as FrConfigSecret[];
    secrets.sort((a, b) => a._id.localeCompare(b._id));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${secrets.length} secrets.`,
      'success'
    );

    if (report) {
      printMessage(
        'Name, Description, Encoding, Use in Placeholders, Last Changed',
        'data'
      );
      for (const secret of secrets) {
        printMessage(
          [
            secret._id,
            csvEscape(secret.description),
            secret.encoding,
            secret.useInPlaceholders,
            friendlyTimestamp(secret.lastChangeDate),
          ].join(','),
          'data'
        );
      }
      return true;
    }

    const indicatorId = createProgressIndicator(
      'determinate',
      secrets.length,
      'Exporting secrets'
    );

    const run = new OperationRun({ unit: 'secret', allowFailures });
    let exported = 0;
    for (const secret of secrets) {
      try {
        const cleanSecret: Partial<SecretSkeleton> = {
          _id: secret._id,
          description: secret.description,
          encoding: secret.encoding,
          useInPlaceholders: secret.useInPlaceholders,
        };
        if (activeOnly) {
          cleanSecret.valueBase64 = `\${${esvToEnv(secret._id)}}`;
        } else {
          const versionsResponse = await readVersionsOfSecret(secret._id);
          const versions = versionsResponse.filter(
            (version) => version.status !== 'DESTROYED'
          );
          const versionInfo = versions.map((version, i) => {
            const versionNumber = (i + 1).toString();

            return {
              version: versionNumber,
              status: version.status,
              valueBase64: `\${${esvToEnv(`${secret._id}_${versionNumber}`)}}`,
            };
          });
          cleanSecret.versions = versionInfo;
        }

        saveJsonToFile(
          cleanSecret,
          getFilePath(`esvs/secrets/${secret._id}.json`, true),
          false
        );
        run.recordSuccess();
        exported++;
        updateProgressIndicator(indicatorId, `Exported secret ${secret._id}`);
      } catch (error) {
        printError(error, `Error exporting secret ${secret._id}`);
        run.recordFailure(secret._id, causeOf(error));
      }
    }
    stopProgressIndicator(
      indicatorId,
      `${exported} secrets exported.`,
      run.hasFailures ? 'fail' : undefined
    );
    return run.finish();
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error exporting secrets to files`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * The files of `esvs/secrets/` that a push reads: every `.json` file, or only
 * the one of the named secret.
 * @param {string} secretsDir the folder of the secret files
 * @param {string} secretName optional name of the secret to push
 * @returns {string[]} the file names
 */
function secretFileNames(secretsDir: string, secretName?: string): string[] {
  return fs
    .readdirSync(secretsDir)
    .filter((name) => name.toLowerCase().endsWith('.json'))
    .filter((name) => !secretName || name === `${secretName}.json`);
}

/**
 * What `push secrets --prune` would delete, found without deleting anything:
 * the versions to delete per secret, the secrets that could not be checked, and
 * the run that counts the checks.
 */
export type SecretPushPruneCheck = {
  plan: { secretId: string; versions: VersionOfSecretSkeleton[] }[];
  notChecked: { secretId: string; reason?: string }[];
  run: OperationRun;
  /** what the prune keeps besides the active version, for the table that shows the plan */
  keepLoaded: boolean;
  keepDeactivated: boolean;
};

/**
 * Finds the versions that `push secrets --prune` would delete, without deleting
 * or importing anything: for every secret of `esvs/secrets/` (or only the named
 * one) that already exists in the tenant, the versions the library would prune.
 * A secret that is not in the tenant yet has nothing to prune. A file that
 * cannot be read, or a secret whose versions cannot be read, is reported, is
 * listed as not checked, is a failed operation of the run and does not stop the
 * others. A missing folder, a named secret that has no file, and a list of
 * secrets that cannot be read are reported and end the check.
 * @param {string} secretName optional name of the secret to check
 * @param {boolean} allowFailures true to let the run succeed although some secrets could not be checked
 * @returns {Promise<SecretPushPruneCheck | undefined>} what would be pruned, or undefined if nothing could be checked (the reason has been printed)
 */
export async function findSecretVersionsToPrune(
  secretName?: string,
  allowFailures: boolean = false
): Promise<SecretPushPruneCheck | undefined> {
  const secretsDir = getFilePath(`esvs/secrets/`);
  if (!fs.existsSync(secretsDir)) {
    printMessage(
      `No secrets to import: the folder '${secretsDir}' does not exist`,
      'error'
    );
    return undefined;
  }
  const fileNames = secretFileNames(secretsDir, secretName);
  if (fileNames.length === 0 && secretName) {
    printMessage(`No matching secret found for ${secretName}`, 'error');
    return undefined;
  }
  const remoteSecrets = await readSecretsOrReport();
  if (!remoteSecrets) return undefined;
  const remoteIds = new Set(remoteSecrets.map((secret) => secret._id));
  const check: SecretPushPruneCheck = {
    plan: [],
    notChecked: [],
    run: new OperationRun({ unit: 'operation', allowFailures }),
    keepLoaded: PUSH_PRUNE_KEEP_LOADED,
    keepDeactivated: PUSH_PRUNE_KEEP_DEACTIVATED,
  };
  const indicatorId = createProgressIndicator(
    'determinate',
    fileNames.length,
    'Finding the versions to prune...'
  );
  for (const fileName of fileNames) {
    const name = fileName.replace(/\.json$/i, '');
    try {
      const secret = readJsonFile(
        `${secretsDir}/${fileName}`
      ) as SecretSkeleton;
      if (remoteIds.has(secret._id)) {
        check.plan.push({
          secretId: secret._id,
          versions: await findVersionsToPrune(
            secret._id,
            PUSH_PRUNE_KEEP_LOADED,
            PUSH_PRUNE_KEEP_DEACTIVATED
          ),
        });
      }
      check.run.recordSuccess();
    } catch (error) {
      printError(error, `Error checking secret from "${fileName}"`);
      check.notChecked.push({ secretId: name, reason: causeOf(error) });
      check.run.recordFailure(`check of secret ${name}`, causeOf(error));
    }
    updateProgressIndicator(indicatorId, `Checked secret ${name}`);
  }
  stopProgressIndicator(
    indicatorId,
    check.notChecked.length === 0
      ? `Checked ${fileNames.length} ${fileNames.length === 1 ? 'secret' : 'secrets'}.`
      : `Could not check ${check.notChecked.length} of ${fileNames.length} secrets`,
    check.notChecked.length === 0 ? 'success' : 'fail'
  );
  return check;
}

/**
 * Import secrets to cloud from fr-config-manager format. Every secret file is
 * its own operation: one that cannot be read or imported is reported and does
 * not stop the others, and one summary names the secrets that failed. A missing
 * secrets folder, or a named secret that has no file, fails the command whatever
 * `allowFailures` says.
 * @param {string} secretName optional name of secret to import
 * @param {boolean} prune if true, prunes old enabled versions before importing new versions.
 * @param {boolean} allowFailures true to succeed although some secrets could not be imported (the failures are still summarised)
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportSecrets(
  secretName?: string,
  prune?: boolean,
  allowFailures: boolean = false
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing secrets...`
  );
  try {
    const secretsDir = getFilePath(`esvs/secrets/`);
    if (!fs.existsSync(secretsDir)) {
      stopProgressIndicator(
        indicatorId,
        `No secrets to import: the folder '${secretsDir}' does not exist`,
        'fail'
      );
      return false;
    }

    const fileNames = secretFileNames(secretsDir, secretName);

    if (fileNames.length === 0) {
      if (secretName) {
        stopProgressIndicator(
          indicatorId,
          `No matching secret found for ${secretName}`,
          'fail'
        );
        return false;
      }
      // nothing to import, when no secret was named, is a success
      stopProgressIndicator(indicatorId, 'No secrets found to import', 'warn');
      return true;
    }

    const remoteSecrets = Object.fromEntries(
      (await readSecrets()).map((s) => [s._id, s])
    );
    const secrets = {} as Record<string, SecretSkeleton>;
    const run = new OperationRun({ unit: 'secret', allowFailures });

    for (const fileName of fileNames) {
      try {
        const secret = readJsonFile(
          `${secretsDir}/${fileName}`
        ) as SecretSkeleton & {
          valueBase64?: string;
          versions?: VersionOfSecretSkeleton[];
        };
        if (prune && remoteSecrets[secret._id]) {
          const prunedVersions = await pruneVersionsOfSecret(
            secret._id,
            PUSH_PRUNE_KEEP_LOADED,
            PUSH_PRUNE_KEEP_DEACTIVATED
          );
          for (const v of prunedVersions) {
            printMessage(`Secret ${secret._id} pruned version ${v.version}`);
          }
        }
        if (secret.valueBase64 !== undefined) {
          secret.versions = [{ valueBase64: secret.valueBase64, version: '1' }];
        }
        const versions = secret.versions.sort((a, b) =>
          Number(a.version) > Number(b.version) ? 1 : -1
        );
        secret.activeVersion = remoteSecrets[secret._id]
          ? remoteSecrets[secret._id].activeVersion
          : null;
        for (let i = 0; i < versions.length; ++i) {
          if (i === 0 && !remoteSecrets[secret._id]) {
            const createResponse = await createSecret(
              secret._id,
              versions[i].valueBase64,
              secret.description,
              secret.encoding,
              secret.useInPlaceholders
            );
            secret.activeVersion = createResponse.activeVersion;
            printMessage(`Secret ${secret._id} created`);
            continue;
          }
          const versionResponse = await createVersionOfSecret(
            secret._id,
            versions[i].valueBase64
          );
          if (versionResponse.version === secret.activeVersion) {
            printMessage(
              `Secret ${secret._id} unchanged version ${versionResponse.version}`
            );
          } else {
            printMessage(
              `Secret ${secret._id} created version ${versionResponse.version}`
            );
          }
          secret.activeVersion = versionResponse.version;
        }
        secrets[secret._id] = secret;
        run.recordSuccess();
      } catch (e) {
        const errorMessage = `Error importing secret from "${fileName}"`;
        printError(e, errorMessage);
        run.recordFailure(fileName.replace(/\.json$/i, ''), causeOf(e));
      }
    }

    let unchanged = 0;
    let updated = 0;

    for (const [id, secret] of Object.entries(secrets)) {
      if (
        remoteSecrets[id] &&
        remoteSecrets[id].activeVersion === secret.activeVersion
      ) {
        unchanged++;
      } else {
        updated++;
      }
    }

    stopProgressIndicator(
      indicatorId,
      `Finished importing secrets.`,
      run.hasFailures ? 'fail' : undefined
    );

    printMessage(
      updated > 0
        ? `Changes made to secrets: ${updated} updated, ${unchanged} unchanged`
        : `No changes, (${unchanged} secrets(s) already up to date)`
    );

    return run.finish();
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing secrets.`, 'fail');
    printError(error, `Error importing secrets.`);
    return false;
  }
}

/**
 * Reads the secrets of the tenant for something that deletes. A listing that
 * fails, or that is not a list, is reported and is not "no secrets": the caller
 * deletes nothing then.
 * @returns {Promise<SecretSkeleton[] | undefined>} the secrets, or undefined if they could not be read (the error has been printed)
 */
async function readSecretsOrReport(): Promise<SecretSkeleton[] | undefined> {
  try {
    const secrets = await readSecrets();
    if (!Array.isArray(secrets)) {
      throw new Error('Error reading secrets: the answer is not a list.');
    }
    return secrets;
  } catch (error) {
    printError(error);
    return undefined;
  }
}

/**
 * Shows what deleting all secrets would delete, for the question that is asked
 * first: every secret by name, how many there are, and that the values of a
 * deleted secret cannot be recovered. Nothing is deleted.
 * @returns {Promise<boolean>} False if the secrets cannot be read; otherwise true.
 */
export async function showSecretDeletePlan(): Promise<boolean> {
  const secrets = await readSecretsOrReport();
  if (!secrets) return false;
  if (secrets.length === 0) {
    printMessage('No secrets found to delete.');
    return true;
  }
  for (const secret of secrets) {
    printMessage(`Dry run: Deleting secret: ${secret._id}`);
  }
  printMessage(
    `${secrets.length} ${secrets.length === 1 ? 'secret' : 'secrets'} would be deleted. The values of a deleted secret cannot be recovered.`,
    'warn'
  );
  return true;
}

/**
 * Delete secrets from the tenant: the one with the given name, or all of them.
 * A secret that cannot be deleted does not stop the others; one summary names
 * the secrets that failed. Secrets that cannot be read fail the command and
 * nothing is deleted, whatever `allowFailures` says.
 * @param {string} name Optional exact secret ID. If omitted (undefined), targets all secrets. An empty name is an error, never "all".
 * @param {boolean} dryRun Show matching secret IDs without deleting them.
 * @param {boolean} allowFailures True to succeed although some secrets could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if the name is empty, reading or any deletion fails (unless failures are allowed for a deletion), or a named secret is not found; true otherwise, also when there is nothing to delete.
 */
export async function configManagerDeleteSecrets(
  name?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty name must never
  // select every secret
  const named = name !== undefined;
  if (named && name.trim() === '') {
    printMessage(
      'The secret name must not be empty. To delete all secrets, leave out the name.',
      'error'
    );
    return false;
  }
  const secrets = await readSecretsOrReport();
  if (!secrets) return false;
  const selectedSecrets = named
    ? secrets.filter((secret) => secret._id === name)
    : secrets;
  if (selectedSecrets.length === 0) {
    if (named) {
      printMessage(`Secret '${name}' not found.`, 'error');
      return false;
    }
    printMessage('No secrets found to delete.');
    return true;
  }
  const run = new OperationRun({ unit: 'secret', allowFailures });
  for (const secret of selectedSecrets) {
    if (dryRun) {
      printMessage(`Dry run: Deleting secret: ${secret._id}`);
      continue;
    }
    try {
      await deleteSecret(secret._id);
      printMessage(`Deleted secret: ${secret._id}`);
      run.recordSuccess();
    } catch (error) {
      printError(error, `Failed to delete secret ${secret._id}`);
      run.recordFailure(secret._id, causeOf(error));
    }
  }
  return run.finish();
}
