import { frodo } from '@rockcarver/frodo-lib';
import {
  createKeyValueTable,
  createProgressBar,
  createTable,
  failSpinner,
  printMessage,
  showSpinner,
  stopProgressBar,
  succeedSpinner,
  updateProgressBar,
} from '../utils/Console';
import wordwrap from './utils/Wordwrap';

const { resolveUserName } = frodo.idm.managed;
const {
  getSecrets,
  putSecret,
  getSecretVersions,
  getSecret,
  setStatusOfVersionOfSecret,
  createNewVersionOfSecret: _createNewVersionOfSecret,
  setSecretDescription: _setSecretDescription,
  deleteSecret: _deleteSecret,
  deleteVersionOfSecret: _deleteVersionOfSecret,
} = frodo.cloud.secret;

/**
 * List secrets
 * @param {boolean} long Long version, all the fields
 */
export async function listSecrets(long) {
  let secrets = [];
  try {
    secrets = await getSecrets();
    secrets.sort((a, b) => a._id.localeCompare(b._id));
  } catch (error) {
    printMessage(`${error.message}`, 'error');
    printMessage(error.response.data, 'error');
  }
  if (long) {
    const table = createTable([
      'Id'['brightCyan'],
      { hAlign: 'right', content: 'Active\nVersion'['brightCyan'] },
      { hAlign: 'right', content: 'Loaded\nVersion'['brightCyan'] },
      'Status'['brightCyan'],
      'Description'['brightCyan'],
      'Modifier'['brightCyan'],
      'Modified'['brightCyan'],
    ]);
    for (const secret of secrets) {
      table.push([
        secret._id,
        { hAlign: 'right', content: secret.activeVersion },
        { hAlign: 'right', content: secret.loadedVersion },
        secret.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
        wordwrap(secret.description, 40),
        await resolveUserName('teammember', secret.lastChangedBy),
        new Date(secret.lastChangeDate).toLocaleString(),
      ]);
    }
    printMessage(table.toString(), 'data');
  } else {
    secrets.forEach((secret) => {
      printMessage(secret._id, 'data');
    });
  }
}

/**
 * Create secret
 * @param {String} id secret id
 * @param {String} value secret value
 * @param {String} description secret description
 * @param {String} encoding secret encoding
 * @param {boolean} useInPlaceholders use secret in placeholders
 */
export async function createSecret(
  id,
  value,
  description,
  encoding,
  useInPlaceholders
) {
  showSpinner(`Creating secret ${id}...`);
  try {
    await putSecret(id, value, description, encoding, useInPlaceholders);
    succeedSpinner(`Created secret ${id}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Set description of secret
 * @param {String} secretId secret id
 * @param {String} description secret description
 */
export async function setSecretDescription(secretId, description) {
  showSpinner(`Setting description of secret ${secretId}...`);
  try {
    await _setSecretDescription(secretId, description);
    succeedSpinner(`Set description of secret ${secretId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Delete a secret
 * @param {String} secretId secret id
 */
export async function deleteSecret(secretId) {
  showSpinner(`Deleting secret ${secretId}...`);
  try {
    await _deleteSecret(secretId);
    succeedSpinner(`Deleted secret ${secretId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Delete all secrets
 */
export async function deleteSecrets() {
  try {
    const secrets = await getSecrets();
    createProgressBar(secrets.length, `Deleting secrets...`);
    for (const secret of secrets) {
      try {
        await _deleteSecret(secret._id);
        updateProgressBar(`Deleted secret ${secret._id}`);
      } catch (error) {
        printMessage(
          `Error: ${error.response.data.code} - ${error.response.data.message}`,
          'error'
        );
      }
    }
    stopProgressBar(`Secrets deleted.`);
  } catch (error) {
    printMessage(
      `Error: ${error.response.data.code} - ${error.response.data.message}`,
      'error'
    );
  }
}

/**
 * List all the versions of the secret
 * @param {String} secretId secret id
 */
export async function listSecretVersions(secretId) {
  let versions = [];
  try {
    versions = await getSecretVersions(secretId);
  } catch (error) {
    printMessage(`${error.message}`, 'error');
    printMessage(error.response.data, 'error');
  }
  const table = createTable([
    { hAlign: 'right', content: 'Version'['brightCyan'] },
    'Status'['brightCyan'],
    'Loaded'['brightCyan'],
    'Created'['brightCyan'],
  ]);
  // versions.sort((a, b) => a._id.localeCompare(b._id));
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
  printMessage(table.toString());
}

/**
 * Describe a secret
 * @param {String} secretId Secret id
 */
export async function describeSecret(secretId) {
  const secret = await getSecret(secretId);
  const table = createKeyValueTable();
  table.push(['Name'['brightCyan'], secret._id]);
  table.push(['Active Version'['brightCyan'], secret.activeVersion]);
  table.push(['Loaded Version'['brightCyan'], secret.loadedVersion]);
  table.push([
    'Status'['brightCyan'],
    secret.loaded ? 'loaded'['brightGreen'] : 'unloaded'['brightRed'],
  ]);
  table.push(['Description'['brightCyan'], wordwrap(secret.description, 60)]);
  table.push([
    'Modified'['brightCyan'],
    new Date(secret.lastChangeDate).toLocaleString(),
  ]);
  table.push([
    'Modifier'['brightCyan'],
    await resolveUserName('teammember', secret.lastChangedBy),
  ]);
  table.push(['Modifier UUID'['brightCyan'], secret.lastChangedBy]);
  table.push(['Encoding'['brightCyan'], secret.encoding]);
  table.push(['Use In Placeholders'['brightCyan'], secret.useInPlaceholders]);
  printMessage(table.toString());
  printMessage('\nSecret Versions:');
  await listSecretVersions(secretId);
}

/**
 * Create new version of secret
 * @param {String} secretId secret id
 * @param {String} value secret value
 */
export async function createNewVersionOfSecret(secretId, value) {
  showSpinner(`Creating new version of secret ${secretId}...`);
  try {
    const version = await _createNewVersionOfSecret(secretId, value);
    succeedSpinner(`Created version ${version.version} of secret ${secretId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Activate a version of a secret
 * @param {String} secretId secret id
 * @param {Number} version version of secret
 */
export async function activateVersionOfSecret(secretId, version) {
  showSpinner(`Activating version ${version} of secret ${secretId}...`);
  try {
    await setStatusOfVersionOfSecret(secretId, version, 'ENABLED');
    succeedSpinner(`Activated version ${version} of secret ${secretId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Deactivate a version of a secret
 * @param {String} secretId secret id
 * @param {Number} version version of secret
 */
export async function deactivateVersionOfSecret(secretId, version) {
  showSpinner(`Deactivating version ${version} of secret ${secretId}...`);
  try {
    await setStatusOfVersionOfSecret(secretId, version, 'DISABLED');
    succeedSpinner(`Deactivated version ${version} of secret ${secretId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}

/**
 * Delete version of secret
 * @param {String} secretId secret id
 * @param {Number} version version of secret
 */
export async function deleteVersionOfSecret(secretId, version) {
  showSpinner(`Deleting version ${version} of secret ${secretId}...`);
  try {
    await _deleteVersionOfSecret(secretId, version);
    succeedSpinner(`Deleted version ${version} of secret ${secretId}`);
  } catch (error) {
    failSpinner(
      `Error: ${error.response.data.code} - ${error.response.data.message}`
    );
  }
}
