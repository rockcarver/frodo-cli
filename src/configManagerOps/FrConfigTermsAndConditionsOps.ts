import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage, verboseMessage } from '../utils/Console';
import { causeOf, isNotFoundError } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

const { saveJsonToFile, getFilePath, readJsonFile } = frodo.utils;
const { readConfigEntity, importConfigEntities, updateConfigEntity } =
  frodo.idm.config;

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

/**
 * Read the terms and conditions entity. A tenant that never configured terms and
 * conditions has no such entity and answers 404: that is no versions, not a
 * failure. Every other error, a refused request included, is thrown.
 * @returns {Promise<any | undefined>} the entity, or undefined when the tenant has none
 */
async function readTermsAndConditions(): Promise<any | undefined> {
  try {
    return await readConfigEntity('selfservice.terms');
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    verboseMessage('The tenant has no terms and conditions configured.');
    return undefined;
  }
}

/**
 * Delete terms and conditions versions: the one with the given identifier, or all
 * of them. All versions live in one config entity, so a version is deleted by
 * writing the entity again without it, one write per version. The list that the
 * next write is built from changes only after a write succeeded: a version that
 * could not be deleted is named and does not take the versions after it along.
 * Only the versions are removed; the entity and its other fields stay, `active`
 * included.
 * @param {string} name Optional exact version identifier. If omitted, targets all versions. An empty string is an error, not "all".
 * @param {boolean} dryRun Show which versions would be deleted without updating the configuration.
 * @param {boolean} allowFailures True to succeed although some versions could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if a named version does not exist, the terms and conditions cannot be read, or a version cannot be deleted (unless failures are allowed). Nothing to delete, also on a tenant without terms and conditions, is a success when no version was named.
 */
export async function configManagerDeleteTermsAndConditions(
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  if (name === '') {
    printMessage(
      'The terms and conditions version must not be empty.',
      'error'
    );
    return false;
  }
  try {
    const terms = await readTermsAndConditions();
    const versions: any[] = Array.isArray(terms?.versions)
      ? terms.versions
      : [];
    const selectedVersions =
      name !== undefined
        ? versions.filter((entry) => entry.version === name)
        : versions;
    if (selectedVersions.length === 0) {
      if (name !== undefined) {
        printMessage(
          `Terms and conditions version '${name}' not found.`,
          'error'
        );
        return false;
      }
      printMessage('No terms and conditions versions found to delete.');
      return true;
    }
    const run = new OperationRun({ unit: 'version', allowFailures });
    let remainingVersions = versions;
    for (const { version: versionId } of selectedVersions) {
      if (dryRun) {
        printMessage(
          `Dry run: Deleting terms and conditions version: ${versionId}`
        );
        continue;
      }
      const nextVersions = remainingVersions.filter(
        (entry) => entry.version !== versionId
      );
      try {
        await updateConfigEntity('selfservice.terms', {
          ...terms,
          versions: nextVersions,
        });
        remainingVersions = nextVersions;
        printMessage(`Deleting terms and conditions version: ${versionId}`);
        run.recordSuccess();
      } catch (error) {
        printError(
          error,
          `Error deleting terms and conditions version ${versionId}`
        );
        run.recordFailure(`${versionId}`, causeOf(error));
      }
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting terms and conditions versions');
    return false;
  }
}
