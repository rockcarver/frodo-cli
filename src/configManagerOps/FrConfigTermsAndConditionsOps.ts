import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { saveJsonToFile, getFilePath } = frodo.utils;
const { readConfigEntity, importConfigEntities, updateConfigEntity } =
  frodo.idm.config;

/**
 * Export terms and conditions to file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerExportTermsAndConditions(): Promise<boolean> {
  try {
    const exportData = (await readConfigEntity('selfservice.terms')) as any;
    for (const version of exportData.versions) {
      for (const [language, text] of Object.entries(
        version.termsTranslations
      )) {
        const languageFileName = `${version.version}/${language}.html`;
        const directoryName = `terms-conditions`;
        version.termsTranslations[language] = extractFrConfigDataToFile(
          text,
          languageFileName,
          directoryName
        );
      }
    }
    saveJsonToFile(
      exportData,
      getFilePath('terms-conditions/terms-conditions.json', true),
      false
    );
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Import terms and conditions from fr-config-manager export
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function configManagerImportTermsAndConditions(): Promise<boolean> {
  try {
    const mainFile = getFilePath('terms-conditions/terms-conditions.json');
    const readMain = fs.readFileSync(mainFile, 'utf8') as any;
    let importData = JSON.parse(readMain) as any;
    const id = importData._id;
    importData = { idm: { [id]: importData } };
    for (const version of importData.idm[id].versions) {
      for (const [language] of Object.entries(version.termsTranslations)) {
        const languageFileName = `${version.version}/${language}.html`;
        const directoryName = `terms-conditions`;
        const fileDir = getFilePath(`${directoryName}/${languageFileName}`);
        version.termsTranslations[language] = fs.readFileSync(fileDir, 'utf8');
      }
    }
    await importConfigEntities(importData);
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}

/**
 * Delete terms and conditions versions.
 * @param name Optional version identifier. If omitted, deletes all versions.
 * @param dryRun Log selected versions without updating the configuration.
 * @returns true if successful, false if reading or updating fails,
 * or a requested version is not found.
 */
export async function configManagerDeleteTermsAndConditions(
  name?: string,
  dryRun = false
): Promise<boolean> {
  try {
    const terms = (await readConfigEntity('selfservice.terms')) as any;
    const versions = terms.versions;
    if (versions.length === 0) {
      console.log('No terms and conditions versions found to delete.');
      return !name;
    }
    let matchFound = false;
    let success = true;
    for (const version of versions) {
      const versionId = version.version;
      if (name && name !== versionId) {
        continue;
      }
      matchFound = true;
      if (dryRun) {
        console.log(
          `Dry run: Deleting terms and conditions version: ${versionId}`
        );
        continue;
      }
      terms.versions = terms.versions.filter(
        (entry) => entry.version !== versionId
      );
      try {
        await updateConfigEntity('selfservice.terms', terms);
        console.log(`Deleting terms and conditions version: ${versionId}`);
      } catch (error) {
        printError(
          error,
          `Error deleting terms and conditions version ${versionId}`
        );
        success = false;
      }
    }
    if (name && !matchFound) {
      console.log(`Warning: terms and conditions version '${name}' not found.`);
      return false;
    }
    return success;
  } catch (error) {
    printError(error, 'Error deleting terms and conditions versions');
    return false;
  }
}
