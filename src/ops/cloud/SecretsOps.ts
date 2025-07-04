import { frodo, FrodoError, state } from '@rockcarver/frodo-lib';
import {
  SecretEncodingType,
  SecretSkeleton,
  VersionOfSecretSkeleton,
} from '@rockcarver/frodo-lib/types/api/cloud/SecretsApi';
import { SecretsExportInterface } from '@rockcarver/frodo-lib/types/ops/cloud/SecretsOps';
import fs from 'fs';

import { getFullExportConfig, getIdLocations } from '../../utils/Config';
import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
  updateProgressIndicator,
} from '../../utils/Console';
import wordwrap from '../utils/Wordwrap';

const { resolveUserName } = frodo.idm.managed;
const {
  readSecrets,
  createSecret: _createSecret,
  readVersionsOfSecret,
  readSecret,
  exportSecret,
  exportSecrets,
  importSecret,
  importSecrets,
  enableVersionOfSecret,
  disableVersionOfSecret,
  createVersionOfSecret: _createVersionOfSecret,
  updateSecretDescription,
  deleteSecret: _deleteSecret,
  deleteVersionOfSecret: _deleteVersionOfSecret,
} = frodo.cloud.secret;

const { getFilePath, getTypedFilename, getWorkingDirectory, saveJsonToFile } =
  frodo.utils;

/**
 * List secrets
 * @param {boolean} long Long version, all the fields besides usage
 * @param {boolean} usage Display usage field
 * @param {String | null} file Optional filename to determine usage
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listSecrets(
  long: boolean = false,
  usage: boolean = false,
  file: string | null = null
): Promise<boolean> {
  let spinnerId: string;
  let secrets: SecretSkeleton[] = [];
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Reading secrets...`
    );
    secrets = await readSecrets();
    secrets.sort((a, b) => a._id.localeCompare(b._id));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${secrets.length} secrets.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error reading secrets`, 'fail');
    printError(error);
    return false;
  }
  if (!long && !usage) {
    secrets.forEach((secret) => {
      printMessage(secret._id, 'data');
    });
    return true;
  }
  let fullExport = null;
  const headers = long
    ? [
        'Id'['brightCyan'],
        { hAlign: 'right', content: 'Active\nVersion'['brightCyan'] },
        { hAlign: 'right', content: 'Loaded\nVersion'['brightCyan'] },
        'Status'['brightCyan'],
        'Description'['brightCyan'],
        'Modifier'['brightCyan'],
        'Modified (UTC)'['brightCyan'],
      ]
    : ['Id'['brightCyan']];
  if (usage) {
    try {
      fullExport = await getFullExportConfig(file);
    } catch (error) {
      printError(error);
      return false;
    }
    //Delete secrets from full export so they aren't mistakenly used for determining usage
    delete fullExport.global.secret;
    headers.push('Used'['brightCyan']);
  }
  const table = createTable(headers);
  for (const secret of secrets) {
    let lastChangedBy = secret.lastChangedBy;
    if (long) {
      try {
        lastChangedBy = state.getUseBearerTokenForAmApis()
          ? secret.lastChangedBy
          : await resolveUserName('teammember', secret.lastChangedBy);
      } catch (error) {
        // ignore
      }
    }
    const values = long
      ? [
          secret._id,
          { hAlign: 'right', content: secret.activeVersion },
          { hAlign: 'right', content: secret.loadedVersion },
          secret.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
          wordwrap(secret.description, 40),
          lastChangedBy,
          new Date(secret.lastChangeDate).toUTCString(),
        ]
      : [secret._id];
    if (usage) {
      const locations = getIdLocations(fullExport, secret._id, true);
      values.push(
        locations.length > 0
          ? `${'yes'['brightGreen']} (${locations.length === 1 ? `at` : `${locations.length} uses, including:`} ${locations[0]})`
          : 'no'['brightRed']
      );
    }
    table.push(values);
  }
  printMessage(table.toString(), 'data');
  return true;
}

/**
 * Create secret
 * @param {string} id secret id
 * @param {string} value secret value
 * @param {string} description secret description
 * @param {SecretEncodingType} encoding secret encoding
 * @param {boolean} useInPlaceholders use secret in placeholders
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createSecret(
  id: string,
  value: string,
  description: string,
  encoding: SecretEncodingType,
  useInPlaceholders: boolean
): Promise<boolean> {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Creating secret ${id}...`
  );
  try {
    await _createSecret(id, value, description, encoding, useInPlaceholders);
    stopProgressIndicator(spinnerId, `Created secret ${id}`, 'success');
    outcome = true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error creating secret ${id}`, 'fail');
    printError(error);
  }
  return outcome;
}

/**
 * Create secret from file (pem / base64hmac)
 * @param {string} id secret id
 * @param {string} file certificate file name
 * @param {string} description secret description
 * @param {SecretEncodingType} encoding secret encoding
 * @param {boolean} useInPlaceholders use secret in placeholders
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createSecretFromFile(
  id: string,
  file: string,
  description: string,
  encoding: SecretEncodingType,
  useInPlaceholders: boolean
): Promise<boolean> {
  let outcome = false;
  const value = fs.readFileSync(getFilePath(file), 'utf8');
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Creating secret ${id}...`
  );
  try {
    await _createSecret(id, value, description, encoding, useInPlaceholders);
    stopProgressIndicator(spinnerId, `Created secret ${id}`, 'success');
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error creating secret ${id} from file ${getFilePath(file)}`,
      'fail'
    );
    printError(error);
  }
  return outcome;
}

/**
 * Set description of secret
 * @param {string} secretId secret id
 * @param {string} description secret description
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function setSecretDescription(
  secretId: string,
  description: string
): Promise<boolean> {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Setting description of secret ${secretId}...`
  );
  try {
    await updateSecretDescription(secretId, description);
    stopProgressIndicator(
      spinnerId,
      `Set description of secret ${secretId}`,
      'success'
    );
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error creating secret ${secretId}`,
      'fail'
    );
    printError(error);
  }
  return outcome;
}

/**
 * Delete a secret
 * @param {string} secretId secret id
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecret(secretId: string): Promise<boolean> {
  let outcome = false;
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Deleting secret ${secretId}...`
  );
  try {
    await _deleteSecret(secretId);
    stopProgressIndicator(spinnerId, `Deleted secret ${secretId}`, 'success');
    outcome = true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error deleting secret ${secretId}`,
      'fail'
    );
    printError(error);
  }
  return outcome;
}

/**
 * Delete all secrets
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteSecrets(): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading secrets...`
  );
  try {
    const secrets = await readSecrets();
    secrets.sort((a, b) => a._id.localeCompare(b._id));
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${secrets.length} secrets.`,
      'success'
    );
    const indicatorId = createProgressIndicator(
      'determinate',
      secrets.length,
      `Deleting secrets...`
    );
    for (const secret of secrets) {
      try {
        await _deleteSecret(secret._id);
        updateProgressIndicator(indicatorId, `Deleted secret ${secret._id}`);
      } catch (error) {
        printError(error);
      }
    }
    stopProgressIndicator(indicatorId, `Secrets deleted.`);
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error deleting secrets`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * List all the versions of the secret
 * @param {String} secretId secret id
 * @param {boolean} json output versions as json. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function listSecretVersions(
  secretId: string,
  json = false
): Promise<boolean> {
  let spinnerId: string;
  let versions: VersionOfSecretSkeleton[] = [];
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Reading secret versions...`
    );
    versions = await readVersionsOfSecret(secretId);
    stopProgressIndicator(
      spinnerId,
      `Successfully read ${versions.length} secret versions.`,
      'success'
    );
    if (json) {
      printMessage(versions, 'data');
      return true;
    }
    const table = createTable([
      { hAlign: 'right', content: 'Version'['brightCyan'] },
      'Status'['brightCyan'],
      'Loaded'['brightCyan'],
      'Created'['brightCyan'],
    ]);
    const statusMap = {
      ENABLED: 'active'['brightGreen'],
      DISABLED: 'inactive'['brightRed'],
      DESTROYED: 'deleted'['brightRed'],
    };
    for (const version of versions) {
      table.push([
        { hAlign: 'right', content: version.version },
        statusMap[version.status],
        version.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
        new Date(version.createDate).toLocaleString(),
      ]);
    }
    printMessage(table.toString(), 'data');
    return true;
  } catch (error) {
    stopProgressIndicator(spinnerId, `Error reading secret versions`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Describe a secret
 * @param {string} secretId secret id
 * @param {string} file optional export file
 * @param {boolean} usage true to describe usage, false otherwise. Default: false
 * @param {boolean} json output description as json. Default: false
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function describeSecret(
  secretId: string,
  file?: string,
  usage = false,
  json = false
): Promise<boolean> {
  try {
    const secret = (await readSecret(secretId)) as SecretSkeleton & {
      locations: string[];
    };
    if (usage) {
      try {
        const fullExport = await getFullExportConfig(file);
        //Delete secrets from full export so they aren't mistakenly used for determining usage
        delete fullExport.global.secret;
        secret.locations = getIdLocations(fullExport, secretId, true);
      } catch (error) {
        printError(error);
        return false;
      }
    }
    if (json) {
      printMessage(secret, 'data');
    } else {
      const table = createKeyValueTable();
      table.push(['Name'['brightCyan'], secret._id]);
      table.push(['Active Version'['brightCyan'], secret.activeVersion]);
      table.push(['Loaded Version'['brightCyan'], secret.loadedVersion]);
      table.push([
        'Status'['brightCyan'],
        secret.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
      ]);
      table.push([
        'Description'['brightCyan'],
        wordwrap(secret.description, 60),
      ]);
      table.push([
        'Modified'['brightCyan'],
        new Date(secret.lastChangeDate).toLocaleString(),
      ]);
      let lastChangedBy = secret.lastChangedBy;
      try {
        lastChangedBy = state.getUseBearerTokenForAmApis()
          ? secret.lastChangedBy
          : await resolveUserName('teammember', secret.lastChangedBy);
      } catch (error) {
        // ignore
      }
      table.push(['Modifier'['brightCyan'], lastChangedBy]);
      table.push(['Modifier UUID'['brightCyan'], secret.lastChangedBy]);
      table.push(['Encoding'['brightCyan'], secret.encoding]);
      table.push([
        'Use In Placeholders'['brightCyan'],
        secret.useInPlaceholders,
      ]);
      if (usage) {
        table.push([
          `Usage Locations (${secret.locations.length} total)`['brightCyan'],
          secret.locations.length > 0 ? secret.locations[0] : '',
        ]);
        for (let i = 1; i < secret.locations.length; i++) {
          table.push(['', secret.locations[i]]);
        }
      }
      printMessage(table.toString(), 'data');
    }
    printMessage('\nSecret Versions:', 'data');
    await listSecretVersions(secretId, json);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export a single secret to file
 * @param {String} secretId Secret id
 * @param {String} file Optional filename
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} includeActiveValue include active value of secret (default: false)
 * @param {string} target Host URL of target environment to encrypt secret value for
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSecretToFile(
  secretId: string,
  file: string | null,
  includeMeta: boolean,
  includeActiveValue?: boolean,
  target?: string
): Promise<boolean> {
  debugMessage(
    `Cli.SecretsOps.exportSecretToFile: start [secretId=${secretId}, file=${file}]`
  );
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(secretId, 'secret');
  }
  const filePath = getFilePath(fileName, true);
  let spinnerId: string;
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Exporting secret ${secretId}`
    );
    const fileData = await exportSecret(secretId, includeActiveValue, target);
    saveJsonToFile(fileData, filePath, includeMeta);
    stopProgressIndicator(
      spinnerId,
      `Exported ${secretId['brightCyan']} to ${filePath['brightCyan']}.`,
      'success'
    );
    debugMessage(
      `Cli.SecretsOps.exportSecretToFile: end [secretId=${secretId}, file=${file}]`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error exporting secret ${secretId} to ${filePath}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all secrets to single file
 * @param {string} file Optional filename
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} includeActiveValue include active value of secret (default: false)
 * @param {string} target Host URL of target environment to encrypt secret value for
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSecretsToFile(
  file: string,
  includeMeta: boolean,
  includeActiveValue?: boolean,
  target?: string
): Promise<boolean> {
  try {
    debugMessage(`Cli.SecretsOps.exportSecretsToFile: start [file=${file}]`);
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(`allSecrets`, 'secret');
    }
    const secretsExport = await exportSecrets(includeActiveValue, target);
    saveJsonToFile(secretsExport, getFilePath(fileName, true), includeMeta);
    debugMessage(`Cli.SecretsOps.exportSecretsToFile: end [file=${file}]`);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all secrets to individual files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @param {boolean} includeActiveValues include active value of secret (default: false)
 * @param {string} target Host URL of target environment to encrypt secret value for
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportSecretsToFiles(
  includeMeta: boolean,
  includeActiveValues?: boolean,
  target?: string
): Promise<boolean> {
  let secrets: SecretSkeleton[] = [];
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Reading secrets...`
  );
  try {
    secrets = await readSecrets();
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
      const fileName = getTypedFilename(secret._id, 'secret');
      const exportData: SecretsExportInterface = await exportSecret(
        secret._id,
        includeActiveValues,
        target
      );
      saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
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
 * Import secret from file
 * @param {string} secretId secret id/name
 * @param {string} file file name
 * @param {boolean} includeActiveValue include active value of secret (default: false)
 * @param {string} source Host URL of source environment where the secret was exported from
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSecretFromFile(
  secretId: string,
  file: string,
  includeActiveValue: boolean = false,
  source: string
): Promise<boolean> {
  debugMessage(
    `cli.SecretsOps.importSecretFromFile: begin [value=${includeActiveValue}, source=${source}]`
  );
  showSpinner(`Importing ${secretId ? secretId : 'first secret'}...`);
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    await importSecret(secretId, fileData, includeActiveValue, source);
    succeedSpinner(`Imported ${secretId ? secretId : 'first secret'}.`);
    debugMessage(`cli.SecretsOps.importSecretFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${secretId ? secretId : 'first secret'}`);
    printError(error);
  }
  return false;
}

/**
 * Import secrets from file
 * @param {string} file file name
 * @param {boolean} includeActiveValues include active values of secrets (default: false)
 * @param {string} source Host URL of source environment where the secrets were exported from
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSecretsFromFile(
  file: string,
  includeActiveValues: boolean = false,
  source: string
): Promise<boolean> {
  debugMessage(`cli.SecretsOps.importSecretsFromFile: begin`);
  const filePath = getFilePath(file);
  showSpinner(`Importing ${filePath}...`);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importSecrets(fileData, includeActiveValues, source);
    succeedSpinner(`Imported ${filePath}.`);
    debugMessage(`cli.SecretsOps.importSecretsFromFile: end`);
    return true;
  } catch (error) {
    failSpinner(`Error importing ${filePath}`);
    printError(error);
  }
  return false;
}

/**
 * Import secrets from files
 * @param {boolean} includeActiveValues include active values of secrets (default: false)
 * @param {string} source Host URL of source environment where the secrets were exported from
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importSecretsFromFiles(
  includeActiveValues: boolean = false,
  source: string
): Promise<boolean> {
  const errors = [];
  let indicatorId: string;
  try {
    debugMessage(`cli.SecretsOps.importSecretsFromFiles: begin`);
    const names = fs.readdirSync(getWorkingDirectory());
    const files = names
      .filter((name) => name.toLowerCase().endsWith('.secret.json'))
      .map((name) => getFilePath(name));
    indicatorId = createProgressIndicator(
      'determinate',
      files.length,
      'Importing secrets...'
    );
    let total = 0;
    for (const file of files) {
      try {
        const data = fs.readFileSync(file, 'utf8');
        const fileData = JSON.parse(data);
        const count = Object.keys(fileData.secret).length;
        total += count;
        await importSecrets(fileData, includeActiveValues, source);
        updateProgressIndicator(
          indicatorId,
          `Imported ${count} secrets from ${file}`
        );
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`Error importing secrets`, errors);
    }
    stopProgressIndicator(
      indicatorId,
      `Finished importing ${total} secrets from ${files.length} files.`
    );
    debugMessage(`cli.SecretsOps.importSecretsFromFiles: end`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing secrets`);
    printError(error);
  }
  return false;
}

/**
 * Create new version of secret
 * @param {string} secretId secret id
 * @param {string} value secret value
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createVersionOfSecret(
  secretId: string,
  value: string
): Promise<boolean> {
  const spinnerId = createProgressIndicator(
    'indeterminate',
    0,
    `Creating new version of secret ${secretId}...`
  );
  try {
    const version = await _createVersionOfSecret(secretId, value);
    stopProgressIndicator(
      spinnerId,
      `Created version ${version.version} of secret ${secretId}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error creating new version of secret ${secretId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Create new version of secret from file
 * @param {string} secretId secret id
 * @param {string} file filename
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function createVersionOfSecretFromFile(
  secretId: string,
  file: string
): Promise<boolean> {
  let spinnerId: string;
  try {
    const value = fs.readFileSync(getFilePath(file), 'utf8');
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Creating new version of secret ${secretId}...`
    );
    const version = await _createVersionOfSecret(secretId, value);
    stopProgressIndicator(
      spinnerId,
      `Created version ${version.version} of secret ${secretId}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error creating new version of secret ${secretId} from ${getFilePath(
        file
      )}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Activate a version of a secret
 * @param {string} secretId secret id
 * @param {string} version version of secret
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function activateVersionOfSecret(
  secretId: string,
  version: string
): Promise<boolean> {
  let spinnerId: string;
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Activating version ${version} of secret ${secretId}...`
    );
    await enableVersionOfSecret(secretId, version);
    stopProgressIndicator(
      spinnerId,
      `Activated version ${version} of secret ${secretId}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error activating version ${version} of secret ${secretId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Deactivate a version of a secret
 * @param {string} secretId secret id
 * @param {string} version version of secret
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deactivateVersionOfSecret(
  secretId: string,
  version: string
): Promise<boolean> {
  let spinnerId: string;
  try {
    const spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Deactivating version ${version} of secret ${secretId}...`
    );
    await disableVersionOfSecret(secretId, version);
    stopProgressIndicator(
      spinnerId,
      `Deactivated version ${version} of secret ${secretId}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error deactivating version ${version} of secret ${secretId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Delete version of secret
 * @param {String} secretId secret id
 * @param {Number} version version of secret
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteVersionOfSecret(
  secretId: string,
  version: string
): Promise<boolean> {
  let spinnerId: string;
  try {
    spinnerId = createProgressIndicator(
      'indeterminate',
      0,
      `Deleting version ${version} of secret ${secretId}...`
    );
    await _deleteVersionOfSecret(secretId, version);
    stopProgressIndicator(
      spinnerId,
      `Deleted version ${version} of secret ${secretId}`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      spinnerId,
      `Error deleting version ${version} of secret ${secretId}`,
      'fail'
    );
    printError(error);
  }
  return false;
}
