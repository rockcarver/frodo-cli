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
  pruneVersionsOfSecret,
  deleteSecret,
} = frodo.cloud.secret;

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

    const fileNames = fs
      .readdirSync(secretsDir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .filter((name) => !secretName || name === `${secretName}.json`);

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
            false,
            true
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
 * Delete secrets from the tenant.
 * @param {string} name Optional exact secret ID. If omitted, targets all secrets.
 * @param {boolean} dryRun Show matching secret IDs without deleting them.
 * @param {boolean} allowFailures True to succeed although some secrets could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if reading or any deletion fails, or if a
 * named secret is not found; otherwise true.
 */
export async function configManagerDeleteSecrets(
  name?: string,
  dryRun = false,
  allowFailures = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'secret', allowFailures });
  let secrets: SecretSkeleton[];
  try {
    secrets = await readSecrets();
  } catch (error) {
    printError(error);
    return false;
  }
  const selectedSecrets = secrets.filter(
    (secret) => !name || secret._id === name
  );
  if (selectedSecrets.length === 0) {
    printMessage(
      name
        ? `Warning: Secret '${name}' not found.`
        : 'No secrets found to delete.',
      'warn'
    );
    return true;
  }
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
