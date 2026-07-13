import { frodo } from '@rockcarver/frodo-lib';
import {
  SecretSkeleton,
  VersionOfSecretSkeleton,
} from '@rockcarver/frodo-lib/types/api/cloud/SecretsApi';
import { SecretsExportInterface } from '@rockcarver/frodo-lib/types/ops/cloud/SecretsOps';
import fs from 'fs';

import {
  createProgressIndicator,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { esvToEnv } from '../utils/FrConfig';

const { getFilePath, saveJsonToFile, readJsonFile } = frodo.utils;
const {
  readSecrets,
  exportSecret,
  createSecret,
  createVersionOfSecret,
  readVersionsOfSecret,
  pruneVersionsOfSecret,
} = frodo.cloud.secret;

type FrConfigSecret = SecretSkeleton & {
  valueBase64: string;
};

/**
 * Export all secrets to individual files in fr-config-manager format
 * @param {boolean} activeOnly true to export only active secret versions, false to export all secrets versions
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportSecrets(
  activeOnly?: boolean
): Promise<boolean> {
  let secrets: FrConfigSecret[] = [];
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
    const indicatorId = createProgressIndicator(
      'determinate',
      secrets.length,
      'Exporting secrets'
    );
    for (const secret of secrets) {
      const exportData: SecretsExportInterface = await exportSecret(
        secret._id,
        false
      );
      const [secretKey] = Object.keys(exportData.secret);
      const fullSecret = exportData.secret[secretKey] as FrConfigSecret;
      const cleanSecret: Partial<SecretSkeleton> = {
        _id: fullSecret._id,
        description: fullSecret.description,
        encoding: fullSecret.encoding,
        useInPlaceholders: fullSecret.useInPlaceholders,
      };
      if (activeOnly) {
        cleanSecret.valueBase64 = `\${${esvToEnv(secret._id)}}`;
      } else {
        const versionsResponse = await readVersionsOfSecret(fullSecret._id);
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
      updateProgressIndicator(indicatorId, `Exported secret ${secret._id}`);
    }
    stopProgressIndicator(indicatorId, `${secrets.length} secrets exported.`);
    return true;
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
 * Import secrets to cloud from fr-config-manager format
 * @param {string} secretName optional name of secret to import
 * @param {boolean} prune if true, prunes old enabled versions before importing new versions.
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportSecrets(
  secretName?: string,
  prune?: boolean
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing secrets...`
  );
  try {
    const secretsDir = getFilePath(`esvs/secrets/`);
    if (!fs.existsSync(secretsDir)) {
      stopProgressIndicator(indicatorId, `No secrets found`, 'fail');
      return false;
    }

    const fileNames = fs
      .readdirSync(secretsDir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .filter((name) => !secretName || name === `${secretName}.json`);

    if (fileNames.length === 0) {
      stopProgressIndicator(
        indicatorId,
        secretName
          ? `No matching secret found for ${secretName}`
          : 'No secrets found to import',
        'fail'
      );
      return false;
    }

    const remoteSecrets = Object.fromEntries(
      (await readSecrets()).map((s) => [s._id, s])
    );
    const secrets = {} as Record<string, SecretSkeleton>;

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
      } catch (e) {
        const errorMessage = `Error importing secret from "${fileName}"`;
        printError(e, errorMessage);
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

    stopProgressIndicator(indicatorId, `Finished importing secrets.`);

    printMessage(
      updated > 0
        ? `Changes made to secrets: ${updated} updated, ${unchanged} unchanged`
        : `No changes, (${unchanged} secrets(s) already up to date)`
    );

    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing secrets.`, 'fail');
    printError(error, `Error importing secrets.`);
    return false;
  }
}
