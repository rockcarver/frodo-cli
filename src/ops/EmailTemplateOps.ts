import fs from 'fs';
import { EmailTemplateSkeleton } from '@rockcarver/frodo-lib/types/api/ApiTypes';
import { EmailTemplate, ExportImportUtils } from '@rockcarver/frodo-lib';
import { getTypedFilename, saveJsonToFile } from '../utils/ExportImportUtils';
import {
  createProgressIndicator,
  updateProgressIndicator,
  stopProgressIndicator,
  printMessage,
  createTable,
} from '../utils/Console';
import wordwrap from './utils/Wordwrap';

const EMAIL_TEMPLATE_FILE_TYPE = 'template.email';
const {
  EMAIL_TEMPLATE_TYPE,
  getEmailTemplate,
  getEmailTemplates,
  putEmailTemplate,
} = EmailTemplate;
const { validateImport } = ExportImportUtils;

const regexEmailTemplateType = new RegExp(`${EMAIL_TEMPLATE_TYPE}/`, 'g');

// use a function vs a template variable to avoid problems in loops
function getFileDataTemplate() {
  return {
    meta: {},
    emailTemplate: {},
  };
}

/**
 * Get a one-line description of the email template
 * @param {EmailTemplateSkeleton} templateObj email template object to describe
 * @returns {string} a one-line description
 */
export function getOneLineDescription(
  templateObj: EmailTemplateSkeleton
): string {
  const description = `[${templateObj._id.split('/')[1]['brightCyan']}] ${
    templateObj.displayName ? templateObj.displayName : ''
  } - ${
    templateObj.defaultLocale
      ? templateObj.subject[templateObj.defaultLocale]
      : Object.values(templateObj.subject)[0]
  }`;
  return description;
}

/**
 * Get markdown table header
 * @returns {string} markdown table header
 */
export function getTableHeaderMd(): string {
  let markdown = '';
  markdown += '| Display Name | Locale(s) | Subject | Id |\n';
  markdown += '| ------------ | --------- | ------- | ---|';
  return markdown;
}

/**
 * Get a table-row of the email template in markdown
 * @param {EmailTemplateSkeleton} templateObj email template object to describe
 * @returns {string} a table-row of the email template in markdown
 */
export function getTableRowMd(templateObj: EmailTemplateSkeleton): string {
  const templateId = templateObj._id.replace(`${EMAIL_TEMPLATE_TYPE}/`, '');
  const locales = `${templateObj.defaultLocale}${
    Object.keys(templateObj.subject).length > 1
      ? ` (${Object.keys(templateObj.subject)
          .filter((locale) => locale !== templateObj.defaultLocale)
          .join(',')})`
      : ''
  }`;
  const row = `| ${
    templateObj.name ? templateObj.name : templateId
  } | ${locales} | ${
    templateObj.subject[templateObj.defaultLocale]
  } | \`${templateId}\` |`;
  return row;
}

/**
 * List email templates
 * @param {boolean} long Long list format with details
 * @return {Promise<unknown[]>} a promise that resolves to an array of email template objects
 */
export async function listEmailTemplates(long = false): Promise<unknown[]> {
  let emailTemplates = [];
  try {
    emailTemplates = (await getEmailTemplates()).result;
  } catch (error) {
    printMessage(`Error retrieving email templates: ${error.message}`, 'error');
  }
  emailTemplates.sort((a, b) => a._id.localeCompare(b._id));
  if (!long) {
    for (const [, emailTemplate] of emailTemplates.entries()) {
      printMessage(
        `${emailTemplate._id.replace(`${EMAIL_TEMPLATE_TYPE}/`, '')}`,
        'data'
      );
    }
  } else {
    const table = createTable([
      'Id'['brightCyan'],
      'Name'['brightCyan'],
      'Status'['brightCyan'],
      'Locale(s)'['brightCyan'],
      'From'['brightCyan'],
      'Subject'['brightCyan'],
    ]);
    for (const emailTemplate of emailTemplates) {
      table.push([
        // Id
        `${emailTemplate._id.replace(`${EMAIL_TEMPLATE_TYPE}/`, '')}`,
        // Name
        `${emailTemplate.displayName ? emailTemplate.displayName : ''}`,
        // Status
        emailTemplate.enabled === false
          ? 'disabled'['brightRed']
          : 'enabled'['brightGreen'],
        // Locale(s)
        `${emailTemplate.defaultLocale}${
          Object.keys(emailTemplate.subject).length > 1
            ? ` (${Object.keys(emailTemplate.subject)
                .filter((locale) => locale !== emailTemplate.defaultLocale)
                .join(',')})`
            : ''
        }`,
        // From
        `${emailTemplate.from ? emailTemplate.from : ''}`,
        // Subject
        wordwrap(emailTemplate.subject[emailTemplate.defaultLocale], 40),
      ]);
    }
    printMessage(table.toString(), 'data');
  }
  return emailTemplates;
}

/**
 * Export single email template to a file
 * @param {string} templateId email template id to export
 * @param {string} file filename where to export the template data
 */
export async function exportEmailTemplateToFile(
  templateId: string,
  file: string
) {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(templateId, EMAIL_TEMPLATE_FILE_TYPE);
  }
  createProgressIndicator('determinate', 1, `Exporting ${templateId}`);
  try {
    const templateData = await getEmailTemplate(templateId);
    updateProgressIndicator(`Writing file ${fileName}`);
    const fileData = getFileDataTemplate();
    fileData.emailTemplate[templateId] = templateData;
    saveJsonToFile(fileData, fileName);
    stopProgressIndicator(
      `Exported ${templateId['brightCyan']} to ${fileName['brightCyan']}.`
    );
  } catch (err) {
    stopProgressIndicator(`${err}`);
    printMessage(err, 'error');
  }
}

/**
 * Export all email templates to file
 * @param {String} file optional filename
 */
export async function exportEmailTemplatesToFile(file) {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(`allEmailTemplates`, EMAIL_TEMPLATE_FILE_TYPE);
  }
  try {
    const fileData = getFileDataTemplate();
    const response = await getEmailTemplates();
    const templates = response.result;
    createProgressIndicator(
      'determinate',
      response.resultCount,
      'Exporting email templates'
    );
    for (const template of templates) {
      const templateId = template._id.replace(`${EMAIL_TEMPLATE_TYPE}/`, '');
      updateProgressIndicator(`Exporting ${templateId}`);
      fileData.emailTemplate[templateId] = template;
    }
    saveJsonToFile(fileData, fileName);
    stopProgressIndicator(
      `${response.resultCount} templates exported to ${fileName}.`
    );
  } catch (err) {
    stopProgressIndicator(`${err}`);
    printMessage(err, 'error');
  }
}

/**
 * Export all email templates to separate files
 */
export async function exportEmailTemplatesToFiles() {
  try {
    const response = await getEmailTemplates();
    const templates = response.result;
    createProgressIndicator(
      'determinate',
      response.resultCount,
      'Exporting email templates'
    );
    for (const template of templates) {
      const templateId = template._id.replace(`${EMAIL_TEMPLATE_TYPE}/`, '');
      const fileName = getTypedFilename(templateId, EMAIL_TEMPLATE_FILE_TYPE);
      const fileData = getFileDataTemplate();
      updateProgressIndicator(`Exporting ${templateId}`);
      fileData.emailTemplate[templateId] = template;
      saveJsonToFile(fileData, fileName);
    }
    stopProgressIndicator(`${response.resultCount} templates exported.`);
  } catch (err) {
    stopProgressIndicator(`${err}`);
    printMessage(err, 'error');
  }
}

/**
 * Import email template by id from file
 * @param {String} templateId email template id
 * @param {String} file optional filename
 */
export async function importEmailTemplateFromFile(templateId, file) {
  // eslint-disable-next-line no-param-reassign
  templateId = templateId.replaceAll(`${EMAIL_TEMPLATE_TYPE}/`, '');
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      createProgressIndicator('determinate', 1, `Importing ${templateId}`);
      if (fileData.emailTemplate[templateId]) {
        try {
          await putEmailTemplate(
            templateId,
            fileData.emailTemplate[templateId]
          );
          updateProgressIndicator(`Importing ${templateId}`);
          stopProgressIndicator(`Imported ${templateId}`);
        } catch (putEmailTemplateError) {
          stopProgressIndicator(`${putEmailTemplateError}`);
          printMessage(putEmailTemplateError, 'error');
        }
      } else {
        stopProgressIndicator(
          `Email template ${templateId.brightCyan} not found in ${file.brightCyan}!`
        );
        printMessage(
          `Email template ${templateId.brightCyan} not found in ${file.brightCyan}!`,
          'error'
        );
      }
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Import all email templates from file
 * @param {String} file optional filename
 */
export async function importEmailTemplatesFromFile(file) {
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      createProgressIndicator(
        'determinate',
        Object.keys(fileData.emailTemplate).length,
        `Importing email templates`
      );
      for (const id in fileData.emailTemplate) {
        if ({}.hasOwnProperty.call(fileData.emailTemplate, id)) {
          const templateId = id.replace(regexEmailTemplateType, '');
          try {
            // eslint-disable-next-line no-await-in-loop
            await putEmailTemplate(
              templateId,
              fileData.emailTemplate[templateId]
            );
            updateProgressIndicator(`Imported ${templateId}`);
          } catch (putEmailTemplateError) {
            printMessage(`\nError importing ${templateId}`, 'error');
            printMessage(putEmailTemplateError.response.data, 'error');
          }
        }
      }
      stopProgressIndicator(`Done.`);
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}

/**
 * Import all email templates from separate files
 */
export async function importEmailTemplatesFromFiles() {
  const names = fs.readdirSync('.');
  const jsonFiles = names.filter((name) =>
    name.toLowerCase().endsWith(`${EMAIL_TEMPLATE_FILE_TYPE}.json`)
  );
  createProgressIndicator(
    'determinate',
    jsonFiles.length,
    'Importing email templates...'
  );
  let total = 0;
  let totalErrors = 0;
  for (const file of jsonFiles) {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      total += Object.keys(fileData.emailTemplate).length;
      let errors = 0;
      for (const id in fileData.emailTemplate) {
        if ({}.hasOwnProperty.call(fileData.emailTemplate, id)) {
          const templateId = id.replace(regexEmailTemplateType, '');
          try {
            // eslint-disable-next-line no-await-in-loop
            await putEmailTemplate(
              templateId,
              fileData.emailTemplate[templateId]
            );
          } catch (putEmailTemplateError) {
            errors += 1;
            printMessage(`\nError importing ${templateId}`, 'error');
            printMessage(putEmailTemplateError.response.data, 'error');
          }
        }
      }
      totalErrors += errors;
      updateProgressIndicator(`Imported ${file}`);
    } else {
      printMessage(`Validation of ${file} failed!`, 'error');
    }
  }
  stopProgressIndicator(
    `Imported ${total - totalErrors} of ${total} email template(s) from ${
      jsonFiles.length
    } file(s).`
  );
}

/**
 * Import first email template from file
 * @param {String} file optional filename
 */
export async function importFirstEmailTemplateFromFile(file) {
  fs.readFile(file, 'utf8', async (err, data) => {
    if (err) throw err;
    const fileData = JSON.parse(data);
    if (validateImport(fileData.meta)) {
      createProgressIndicator(
        'determinate',
        1,
        `Importing first email template`
      );
      for (const id in fileData.emailTemplate) {
        if ({}.hasOwnProperty.call(fileData.emailTemplate, id)) {
          try {
            await putEmailTemplate(
              id.replace(regexEmailTemplateType, ''),
              fileData.emailTemplate[id]
            );
            updateProgressIndicator(`Imported ${id}`);
            stopProgressIndicator(`Imported ${id}`);
          } catch (putEmailTemplateError) {
            stopProgressIndicator(`Error importing email template ${id}`);
            printMessage(`\nError importing email template ${id}`, 'error');
            printMessage(putEmailTemplateError.response.data, 'error');
          }
          break;
        }
      }
    } else {
      printMessage('Import validation failed...', 'error');
    }
  });
}
