
import { frodo } from '@rockcarver/frodo-lib';
import {  printError } from '../utils/Console';
import { extractFrConfigDataToFile } from '../utils/Config';
const {
  exportTermsAndConditions,
} = frodo.terms;
const {
  saveJsonToFile,
  getFilePath
} = frodo.utils;

/**
 * Export terms and conditions to file
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function exportTermsAndConditionsToFiles(): Promise<boolean> {
  try {
    const exportData = await exportTermsAndConditions();
    for (const version of exportData.versions) {
      for (const [language, text] of Object.entries(version.termsTranslations)) {
        const languageFileName = `${version.version}/${language}.html`;
        const directoryName = `terms-conditions`
        // @ts-expect-error
        version.termsTranslations[language] = extractFrConfigDataToFile(text, languageFileName, directoryName);
      }
    }
    saveJsonToFile(
      exportData,
      getFilePath('terms-conditions/terms-conditions.json', true),
      false
    );
  } catch (error) {
    printError(error);
  }
  return false;
}
