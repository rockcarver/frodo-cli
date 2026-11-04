import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;
const { readConfigEntity, importConfigEntities } = frodo.idm.config;

/**
 * Export terms and conditions to file in fr-config-manager format
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
    const termsAndConditions = readJsonFile(
      getFilePath('terms-conditions/terms-conditions.json')
    ) as any;
    for (const version of termsAndConditions.versions) {
      for (const [language] of Object.entries(version.termsTranslations)) {
        const languageFileName = `${version.version}/${language}.html`;
        const directoryName = `terms-conditions`;
        const fileDir = getFilePath(`${directoryName}/${languageFileName}`);
        version.termsTranslations[language] = fs.readFileSync(fileDir, 'utf8');
      }
    }
    await importConfigEntities({
      idm: { [termsAndConditions._id]: termsAndConditions },
    });
    return true;
  } catch (error) {
    printError(error);
    return false;
  }
}
