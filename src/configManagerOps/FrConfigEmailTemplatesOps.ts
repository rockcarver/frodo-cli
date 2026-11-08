import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import { printError, printMessage } from '../utils/Console';
import { causeOf } from '../utils/ErrorCause';
import { countItems, importItemsOfFile } from '../utils/ImportItems';
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
 * Every template is one operation of an {@link OperationRun}: a template whose files cannot be
 * written is printed and named in one summary, and the others are still written. A failure to read
 * the templates, or a named template that does not exist, ends the command whatever
 * `--allow-failures` says.
 * @param {string} name Optional template name. If not specified, exports all email templates.
 * @param {boolean} allowFailures true to report templates that could not be exported but still succeed. Default: false
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportEmailTemplates(
  name?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'email template', allowFailures });
  try {
    const templates = name
      ? [await readEmailTemplate(name)]
      : await readEmailTemplates();
    if (templates.length === 0) {
      printMessage('No email templates found to export.', 'info');
      return true;
    }
    for (const template of templates) {
      const templateName = template._id.split('/')[1];
      await run.run(templateName, async () => {
        const templatePath = `email-templates/${templateName}`;
        await splitLangToFile(
          template.html,
          templatePath,
          templateName,
          'html'
        );
        await splitLangToFile(
          template.message,
          templatePath,
          templateName,
          'md'
        );
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
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error exporting email templates to files`);
    if (run.hasFailures) run.finish();
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
 * Every template folder is read on its own: a template that cannot be read is printed and named
 * in the one summary, and the other templates are still imported. The templates that the library
 * cannot import are named in the summary too. A missing folder, a folder without templates and a
 * named template that no folder holds end the command whatever `--allow-failures` says.
 * @param {string} templateName Optional template name. If not specified, imports all email templates.
 * @param {boolean} allowFailures true to report templates that could not be imported but still succeed. Default: false
 * @returns {boolean} true if successful, false otherwise
 */
export async function configManagerImportEmailTemplates(
  templateName?: string,
  allowFailures: boolean = false
): Promise<boolean> {
  const run = new OperationRun({ unit: 'email template', allowFailures });
  try {
    const templatesDir = `${getWorkingDirectory()}/email-templates`;
    if (!fs.existsSync(templatesDir)) {
      printMessage(
        `No email templates folder found: ${templatesDir} does not exist.`,
        'error'
      );
      return false;
    }
    const templateFiles = fs.readdirSync(templatesDir);
    if (templateFiles.length === 0) {
      printMessage(
        `No email template folders found in ${templatesDir}.`,
        'error'
      );
      return false;
    }
    const importTemplateData = { emailTemplate: {} };

    for (const templateFile of templateFiles) {
      try {
        const importData = readJsonFile(
          getFilePath(`email-templates/${templateFile}/${templateFile}.json`)
        ) as any;

        if (
          templateName &&
          importData._id !== `emailTemplate/${templateName}`
        ) {
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
            importData.message[locale] = fs.readFileSync(
              messageFilePath,
              'utf8'
            );
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
      } catch (error) {
        printError(error);
        run.recordFailure(templateFile, causeOf(error));
      }
    }
    if (templateName && countItems(importTemplateData, 'emailTemplate') === 0) {
      printMessage(
        `Email template ${templateName} not found in ${templatesDir}.`,
        'error'
      );
      if (run.hasFailures) run.finish();
      return false;
    }
    if (countItems(importTemplateData, 'emailTemplate') > 0) {
      await importItemsOfFile(run, importTemplateData, {
        count: (data) => countItems(data, 'emailTemplate'),
        importItems: (data) => importEmailTemplates(data),
        fallbackName: templatesDir,
      });
    }
    return run.finish();
  } catch (error) {
    printError(error, `Error importing email templates to files`);
    if (run.hasFailures) run.finish();
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
