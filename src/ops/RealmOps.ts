import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { RealmExportInterface } from '@rockcarver/frodo-lib/types/ops/RealmOps';
import fs from 'fs';

import {
  createKeyValueTable,
  createProgressIndicator,
  createTable,
  debugMessage,
  printError,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';

const {
  readRealm,
  readRealms,
  readRealmByName,
  exportRealms,
  importRealms,
  updateRealm,
} = frodo.realm;

const {
  getTypedFilename,
  saveToFile,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;

/**
 * List realms
 * @param {boolean} long Long list format with details
 */
export async function listRealms(long = false) {
  try {
    const realms = await readRealms();
    if (long) {
      const table = createTable([
        'Id'['brightCyan'],
        'Name'['brightCyan'],
        'Status'['brightCyan'],
        'Custom Domains'['brightCyan'],
        'Parent Path'['brightCyan'],
      ]);
      realms.forEach((realmConfig) => {
        table.push([
          realmConfig._id,
          realmConfig.name,
          realmConfig.active
            ? 'active'['brightGreen']
            : 'inactive'['brightRed'],
          realmConfig.aliases.join('\n'),
          realmConfig.parentPath,
        ]);
      });
      printMessage(table.toString(), 'data');
    } else {
      realms.forEach((realmConfig) => {
        printMessage(
          (realmConfig.parentPath || '') +
            (realmConfig.parentPath && !realmConfig.parentPath.endsWith('/')
              ? '/'
              : '') +
            realmConfig.name,
          'data'
        );
      });
    }
  } catch (error) {
    printMessage(error, 'error');
    printMessage(`Error listing realms: ${error.message}`, 'error');
    printMessage(error.response?.data, 'error');
  }
}

/**
 * Export realm to file by id
 * @param {string} realmId realm id
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportRealmById(
  realmId: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${realmId}...`
  );
  try {
    const realm = await readRealm(realmId);
    let fileName = getTypedFilename(realmId, `realm`);
    if (file) {
      fileName = file;
    }
    updateProgressIndicator(indicatorId, `Saving ${realmId} to ${fileName}...`);
    saveToFile(
      'realm',
      [realm],
      '_id',
      getFilePath(fileName, true),
      includeMeta
    );
    stopProgressIndicator(
      indicatorId,
      `Exported realm ${realmId} to file`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting realm ${realmId} to file`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export realm to file by name
 * @param {string} realmName realm name
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportRealmByName(
  realmName: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${realmName}...`
  );
  try {
    const realm = await readRealmByName(realmName);
    let fileName = getTypedFilename(
      !realmName || realmName === '/' ? 'root' : realmName,
      `realm`
    );
    if (file) {
      fileName = file;
    }
    updateProgressIndicator(
      indicatorId,
      `Saving ${realmName} to ${fileName}...`
    );
    saveToFile(
      'realm',
      [realm],
      '_id',
      getFilePath(fileName, true),
      includeMeta
    );
    stopProgressIndicator(
      indicatorId,
      `Exported realm ${realmName} to file`,
      'success'
    );
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error exporting realm ${realmName} to file`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Export all realms to file
 * @param {string} file file name
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportRealmsToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const exportData = await exportRealms();
    let fileName = getTypedFilename(`allRealms`, `realm`);
    if (file) {
      fileName = file;
    }
    saveJsonToFile(exportData, getFilePath(fileName, true), includeMeta);
    return true;
  } catch (error) {
    printError(error, `Error exporting realms to file`);
  }
  return false;
}

/**
 * Export all realms to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportRealmsToFiles(
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    const realms = await readRealms();
    for (const realm of realms) {
      const fileName = getTypedFilename(
        !realm.name || realm.name === '/' ? 'root' : realm.name,
        'realm'
      );
      saveToFile(
        'realm',
        realm,
        '_id',
        getFilePath(fileName, true),
        includeMeta
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting realms to files`);
  }
  return false;
}

/**
 * Import a realm from file. The first realm from the file will be imported if no id/name is provided.
 * @param {string} realmId realm id
 * @param {string} realmName realm name
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importRealmFromFile(
  realmId: string,
  realmName: string,
  file: string
): Promise<boolean> {
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    'Importing realm...'
  );
  try {
    const importData = JSON.parse(
      fs.readFileSync(getFilePath(file), 'utf8')
    ) as RealmExportInterface;
    if (!realmId && !realmName) {
      const firstRealm = Object.values(importData.realm)[0];
      if (!firstRealm) {
        stopProgressIndicator(indicatorId, `No realms found!`, 'fail');
        return false;
      }
      realmName = firstRealm.name;
    }
    updateProgressIndicator(
      indicatorId,
      `Importing realm ${realmName ? realmName : realmId}.`
    );
    await importRealms(importData, realmId, realmName);
    stopProgressIndicator(indicatorId, `Successfully imported realm.`);
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `Error importing realm`, 'fail');
    printError(error);
  }
  return false;
}

/**
 * Import all realms from file
 * @param {string} file import file name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importRealmsFromFile(file: string): Promise<boolean> {
  try {
    debugMessage(`importRealmsFromFile: start`);
    const filePath = getFilePath(file);
    const data = fs.readFileSync(filePath, 'utf8');
    debugMessage(`importRealmsFromFile: importing ${filePath}`);
    const importData = JSON.parse(data);
    await importRealms(importData);
    debugMessage(`importRealmsFromFile: end`);
    return true;
  } catch (error) {
    printError(error, `Error importing realms from file`);
  }
  return false;
}

/**
 * Import all realms from separate files
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function importRealmsFromFiles(): Promise<boolean> {
  const errors: Error[] = [];
  try {
    const names = fs.readdirSync(getWorkingDirectory());
    const realmFiles = names.filter((name) =>
      name.toLowerCase().endsWith('.realm.json')
    );
    for (const file of realmFiles) {
      try {
        await importRealmsFromFile(file);
      } catch (error) {
        errors.push(
          new FrodoError(`Error importing realms from ${file}`, error)
        );
      }
    }
    if (errors.length > 0) {
      throw new FrodoError(`One or more errors importing realms`, errors);
    }
    return true;
  } catch (error) {
    if (errors.length > 0) {
      printError(error);
    } else {
      printError(error, `Error importing realms from files`);
    }
  }
  return false;
}

/**
 * Describe realm
 * @param {String} realm realm name
 */
export async function describeRealm(realm: string) {
  try {
    const realmConfig = await readRealmByName(realm);
    const table = createKeyValueTable();
    table.push(['Name'['brightCyan'], realmConfig.name]);
    table.push([
      'Status'['brightCyan'],
      realmConfig.active ? 'active'['brightGreen'] : 'inactive'['brightRed'],
    ]);
    table.push([
      'Custom Domains'['brightCyan'],
      realmConfig.aliases.join('\n'),
    ]);
    table.push(['Parent'['brightCyan'], realmConfig.parentPath]);
    table.push(['Id'['brightCyan'], realmConfig._id]);
    printMessage(table.toString(), 'data');
  } catch (error) {
    printMessage(`Realm ${realm} not found!`, 'error');
  }
}

/**
 * Add custom DNS domain name (realm DNS alias)
 * @param {String} realm realm name
 * @param {String} domain domain name
 */
export async function addCustomDomain(realm: string, domain: string) {
  try {
    let realmConfig = await readRealmByName(realm);
    let exists = false;
    realmConfig.aliases.forEach((alias) => {
      if (domain.toLowerCase() === alias.toLowerCase()) {
        exists = true;
      }
    });
    if (!exists) {
      try {
        realmConfig.aliases.push(domain.toLowerCase());
        realmConfig = await updateRealm(realmConfig._id, realmConfig);
        const table = createKeyValueTable();
        table.push(['Name'['brightCyan'], realmConfig.name]);
        table.push([
          'Status'['brightCyan'],
          realmConfig.active
            ? 'active'['brightGreen']
            : 'inactive'['brightRed'],
        ]);
        table.push([
          'Custom Domains'['brightCyan'],
          realmConfig.aliases.join('\n'),
        ]);
        table.push(['Parent'['brightCyan'], realmConfig.parentPath]);
        table.push(['Id'['brightCyan'], realmConfig._id]);
        printMessage(table.toString());
      } catch (error) {
        printMessage(`Error adding custom domain: ${error.message}`, 'error');
      }
    }
  } catch (error) {
    printMessage(`${error.message}`, 'error');
  }
}

/**
 * Remove custom DNS domain name (realm DNS alias)
 * @param {String} realm realm name
 * @param {String} domain domain name
 */
export async function removeCustomDomain(realm: string, domain: string) {
  try {
    let realmConfig = await readRealmByName(realm);
    const aliases = realmConfig.aliases.filter(
      (alias) => domain.toLowerCase() !== alias.toLowerCase()
    );
    if (aliases.length < realmConfig.aliases.length) {
      try {
        realmConfig.aliases = aliases;
        realmConfig = await updateRealm(realmConfig._id, realmConfig);
        const table = createKeyValueTable();
        table.push(['Name'['brightCyan'], realmConfig.name]);
        table.push([
          'Status'['brightCyan'],
          realmConfig.active
            ? 'active'['brightGreen']
            : 'inactive'['brightRed'],
        ]);
        table.push([
          'Custom Domains'['brightCyan'],
          realmConfig.aliases.join('\n'),
        ]);
        table.push(['Parent'['brightCyan'], realmConfig.parentPath]);
        table.push(['Id'['brightCyan'], realmConfig._id]);
        printMessage(table.toString());
      } catch (error) {
        printMessage(`Error removing custom domain: ${error.message}`, 'error');
      }
    }
  } catch (error) {
    printMessage(`${error.message}`, 'error');
  }
}
