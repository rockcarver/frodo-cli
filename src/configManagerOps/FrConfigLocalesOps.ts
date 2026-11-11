import fs from 'fs';
import {
  frodo,
  type FrodoError,
  type IdObjectSkeletonInterface,
} from '@rockcarver/frodo-lib';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

const { readConfigEntitiesByType, importConfigEntities, deleteConfigEntity } =
  frodo.idm.config;
const { saveJsonToFile, getFilePath, readJsonFile, getWorkingDirectory } =
  frodo.utils;

/**
 * The locale that the library names in the error of an entity it could not update.
 * @param {FrodoError} error the error the library reported for one entity
 * @returns {string | undefined} the locale name, or undefined if the message has another shape
 */
function importedLocaleNameOf(error: FrodoError): string | undefined {
  return error.message?.match(/ config entity uilocale\/(.+)$/)?.[1];
}

/**
 * Export IDM locales configuration in fr-config-manager format.
 * @param {string} name optional name of the locale to export
 * @param {boolean} allowFailures true to succeed although some locales could not be exported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to false if a named locale does not exist, the locales cannot be read, or a locale cannot be exported (unless failures are allowed). No locales when none was named is a success.
 */
export async function configManagerExportLocales(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const locales = (await readConfigEntitiesByType('uilocale')).filter(
      (locale) => !name || locale._id.split('/')[1] === name
    );
    if (name && locales.length === 0) {
      printMessage(`Locale '${name}' not found.`, 'error');
      return false;
    }
    if (locales.length === 0) {
      printMessage('No locales found to export.');
      return true;
    }
    const run = new OperationRun({ unit: 'locale', allowFailures });
    for (const locale of locales) {
      const localeName = locale._id.split('/')[1];
      try {
        const localeFilename = `locales/${localeName}.json`;
        saveJsonToFile(locale, getFilePath(localeFilename, true), false, true);
        run.recordSuccess();
      } catch (error) {
        printError(error, `Error exporting locale ${localeName}`);
        run.recordFailure(localeName, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting locales`);
  }
  return false;
}

/**
 * Import IDM locales configuration from fr-config-manager format.
 * @param {string} name optional name of the locale to import
 * @param {boolean} allowFailures true to succeed although some locales could not be imported (the failures are still summarised)
 * @return {Promise<boolean>} a promise that resolves to false if the locales folder or a named locale does not exist, or a locale cannot be read or imported (unless failures are allowed). No locales when none was named is a success.
 */
export async function configManagerImportLocales(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    printMessage(`Updating locale${name ? ` ${name}` : 's'}`);
    const localesDir = `${getWorkingDirectory()}/locales`;
    if (!fs.existsSync(localesDir)) {
      printMessage(`Locales folder not found: ${localesDir}`, 'error');
      return false;
    }
    const localeFiles = fs.readdirSync(localesDir, 'utf8');
    const run = new OperationRun({ unit: 'locale', allowFailures });
    const importLocaleData = { idm: {} };
    for (const localeFile of localeFiles) {
      try {
        const locale = readJsonFile(
          getFilePath(`locales/${localeFile}`)
        ) as IdObjectSkeletonInterface;
        if (name && locale._id !== `uilocale/${name}`) continue;
        importLocaleData.idm[locale._id] = locale;
      } catch (error) {
        // a file that cannot be read or parsed is a failed locale
        printError(error, `Error reading locale file ${localeFile}`);
        run.recordFailure(localeFile, causeOf(error));
      }
    }
    if (name && !importLocaleData.idm[`uilocale/${name}`]) {
      printMessage(`Locale '${name}' not found in ${localesDir}`, 'error');
      return false;
    }
    if (Object.keys(importLocaleData.idm).length === 0 && !run.hasFailures) {
      printMessage(`No locales found to import in ${localesDir}`);
      return true;
    }
    await importConfigEntities(
      importLocaleData,
      undefined,
      undefined,
      run.resultCallback(importedLocaleNameOf)
    );
    return run.finish();
  } catch (error) {
    printError(error, `Error importing locales`);
    return false;
  }
}

/** The start of the id of a locale in the IDM configuration: `uilocale/en`. */
const LOCALE_ID_PREFIX = 'uilocale/';

/**
 * Delete locales from the tenant: the one with the given name, or all of them.
 * A locale is the IDM config entity `uilocale/<name>`; the entities whose id
 * does not start with `uilocale/` are not locales and are never selected. The
 * locales are read once and deleted one by one, so that a locale that cannot be
 * deleted is reported and does not hide the others. Locales that cannot be read
 * fail the command and nothing is deleted, whatever `allowFailures` says.
 * @param {string} localeName Optional exact locale name (for example `en`). If omitted (undefined), targets all locales. An empty name is an error, never "all".
 * @param {boolean} dryRun Show which locales would be deleted without deleting them.
 * @param {boolean} allowFailures True to succeed although some locales could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if the name is empty, the locales cannot be read, a named locale does not exist, or a locale cannot be deleted (unless failures are allowed for a deletion); true otherwise, also when there is nothing to delete and no locale was named.
 */
export async function configManagerDeleteLocales(
  localeName?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  // "not given" and "given but empty" are different: an empty name must never
  // select every locale
  const named = localeName !== undefined;
  if (named && localeName.trim() === '') {
    printMessage(
      'The locale name must not be empty. To delete all locales, leave out the name.',
      'error'
    );
    return false;
  }
  const run = new OperationRun({ unit: 'locale', allowFailures });
  try {
    const locales = await readConfigEntitiesByType('uilocale');
    // the library selects the ids that start with `uilocale` (no slash)
    const selectedLocales = locales.filter((locale) =>
      named
        ? locale._id === `${LOCALE_ID_PREFIX}${localeName}`
        : locale._id.startsWith(LOCALE_ID_PREFIX)
    );
    if (selectedLocales.length === 0) {
      if (named) {
        printMessage(`Locale '${localeName}' not found.`, 'error');
        return false;
      }
      printMessage('No locales found to delete.', 'warn');
      return true;
    }
    for (const locale of selectedLocales) {
      const name = locale._id.slice(LOCALE_ID_PREFIX.length);
      if (dryRun) {
        printMessage(`Dry run: Deleting uilocale: ${name}`);
        continue;
      }
      try {
        await deleteConfigEntity(locale._id);
        printMessage(`Deleting uilocale: ${name}`);
        run.recordSuccess();
      } catch (error) {
        // the error of the library does not name the locale: the line does
        printError(error, `Error deleting uilocale ${name}`);
        run.recordFailure(name, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting config entity locales');
    return false;
  }
}
