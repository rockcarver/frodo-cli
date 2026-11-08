import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { OperationRun } from '../utils/OperationRun';

const { getFilePath, saveJsonToFile, readJsonFile, getWorkingDirectory } =
  frodo.utils;
const {
  readEmailTemplates,
  readEmailTemplate,
  importEmailTemplates,
  deleteEmailTemplate,
} = frodo.email.template;

/**
 * Export email templates in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportEmailTemplates(
  name?: string
): Promise<boolean> {
  try {
    const templates = name
      ? [await readEmailTemplate(name)]
      : await readEmailTemplates();
    for (const template of templates) {
      const templateName = template._id.split('/')[1];
      const templatePath = `email-templates/${templateName}`;
      await splitLangToFile(template.html, templatePath, templateName, 'html');
      await splitLangToFile(template.message, templatePath, templateName, 'md');
      if (template.styles) {
        const cssFilename = `${templateName}.css`;
        extractFrConfigDataToFile(template.styles, cssFilename, templatePath);
        template.styles = {
          file: cssFilename,
        };
      }
      saveJsonToFile(
        template,
        getFilePath(`${templatePath}/${templateName}.json`, true),
        false,
        true
      );
    }
    return true;
  } catch (error) {
    printError(error, `Error exporting email templates to files`);
  }
  return false;
}

async function splitLangToFile(property, templatePath, templateName, suffix) {
  if (!property) {
    return;
  }
  Object.entries(property).forEach(([language, text]) => {
    const fileName = `${templateName}.${language}.${suffix}`;
    extractFrConfigDataToFile(text, fileName, templatePath);
    property[language] = {
      file: fileName,
    };
  });
}

/**
 * Imports email templates that were exported using config-manager
 * @param {string} templateName Optional template name. If not specified, imports all email templates.
 * @returns {boolean} true if successful, false otherwise
 */
export async function configManagerImportEmailTemplates(
  templateName?: string
): Promise<boolean> {
  try {
    const templateFiles = fs.readdirSync(
      `${getWorkingDirectory()}/email-templates`
    );
    const importTemplateData = { emailTemplate: {} };

    for (const templateFile of templateFiles) {
      const importData = readJsonFile(
        getFilePath(`email-templates/${templateFile}/${templateFile}.json`)
      ) as any;

      if (templateName && importData._id !== `emailTemplate/${templateName}`) {
        continue;
      }

      if (importData.html && typeof importData.html === 'object') {
        for (const locale in importData.html) {
          const htmlFilePath = getFilePath(
            `email-templates/${templateFile}/${importData.html[locale].file}`
          );
          importData.html[locale] = fs.readFileSync(htmlFilePath, 'utf8');
        }
      }
      if (importData.message && typeof importData.message === 'object') {
        for (const locale in importData.message) {
          const messageFilePath = getFilePath(
            `email-templates/${templateFile}/${importData.message[locale].file}`
          );
          importData.message[locale] = fs.readFileSync(messageFilePath, 'utf8');
        }
      }
      if (importData.styles && typeof importData.styles === 'object') {
        const stylesFilePath = getFilePath(
          `email-templates/${templateFile}/${importData.styles.file}`
        );
        importData.styles = fs.readFileSync(stylesFilePath, 'utf8');
      }
      importTemplateData.emailTemplate[
        importData._id.replace('emailTemplate/', '')
      ] = importData;
    }
    await importEmailTemplates(importTemplateData);
    return true;
  } catch (error) {
    printError(error, `Error importing email templates to files`);
  }
  return false;
}

/**
 * Delete email templates: the one with the given name, or all of them. The
 * templates are read once and deleted one by one, so that one that cannot be
 * deleted is reported and does not hide the others.
 * @param {string} name Optional exact template name. If omitted, targets all templates.
 * @param {boolean} dryRun Show which templates would be deleted without deleting them.
 * @param {boolean} allowFailures True to succeed although some templates could not be deleted (the failures are still summarised)
 * @returns {Promise<boolean>} False if a named template does not exist or a read or deletion fails (unless failures are allowed for a deletion); true otherwise, also when there is nothing to delete.
 */
export async function configManagerDeleteEmailTemplates(
  name?: string,
  dryRun: boolean = false,
  allowFailures: boolean = false
): Promise<boolean> {
  try {
    const allTemplates = await readEmailTemplates();
    const templates = name
      ? allTemplates.filter(
          (template) => template._id === `emailTemplate/${name}`
        )
      : allTemplates;
    if (templates.length === 0) {
      if (name) {
        printMessage(`Email template '${name}' not found.`, 'error');
        return false;
      }
      printMessage('No email templates found to delete.');
      return true;
    }
    const run = new OperationRun({ unit: 'email template', allowFailures });
    for (const template of templates) {
      const templateName = template._id.split('/')[1];
      if (!dryRun) {
        try {
          await deleteEmailTemplate(templateName);
          run.recordSuccess();
        } catch (error) {
          printError(error, `Failed to delete email template ${templateName}`);
          run.recordFailure(templateName, causeOf(error));
          continue;
        }
      }
      printMessage(
        `${dryRun ? 'Dry run: ' : ''}Deleting emailTemplate: ${templateName}`
      );
    }
    return run.finish();
  } catch (error) {
    printError(error, 'Error deleting email templates');
    return false;
  }
}
