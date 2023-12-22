import { frodo } from '@rockcarver/frodo-lib';
import { EmailTemplateSkeleton } from '@rockcarver/frodo-lib/types/ops/EmailTemplateOps';
import fs from 'fs';
import path from 'path';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  printMessage,
  stopProgressIndicator,
  updateProgressIndicator,
} from '../utils/Console';
import { cloneDeep } from './utils/OpsUtils';
import wordwrap from './utils/Wordwrap';

const {
  validateImport,
  getTypedFilename,
  saveJsonToFile,
  getFilePath,
  getWorkingDirectory,
} = frodo.utils;
const {
  EMAIL_TEMPLATE_TYPE,
  readEmailTemplates,
  readEmailTemplate,
  exportEmailTemplates,
  updateEmailTemplate,
  importEmailTemplates,
} = frodo.email.template;

const EMAIL_TEMPLATE_FILE_TYPE = 'template.email';

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
    emailTemplates = await readEmailTemplates();
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
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportEmailTemplateToFile(
  templateId: string,
  file: string,
  includeMeta = true
) {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(templateId, EMAIL_TEMPLATE_FILE_TYPE);
  }
  const filePath = getFilePath(fileName, true);
  const indicatorId = createProgressIndicator(
    'determinate',
    1,
    `Exporting ${templateId}`
  );
  try {
    const templateData = await readEmailTemplate(templateId);
    updateProgressIndicator(indicatorId, `Writing file ${filePath}`);
    const fileData = getFileDataTemplate();
    fileData.emailTemplate[templateId] = templateData;
    saveJsonToFile(fileData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported ${templateId['brightCyan']} to ${filePath['brightCyan']}.`
    );
  } catch (err) {
    stopProgressIndicator(indicatorId, `${err}`);
    printMessage(err, 'error');
  }
}

/**
 * Export all email templates to file
 * @param {String} file optional filename
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportEmailTemplatesToFile(file, includeMeta = true) {
  let fileName = file;
  if (!fileName) {
    fileName = getTypedFilename(`allEmailTemplates`, EMAIL_TEMPLATE_FILE_TYPE);
  }
  const filePath = getFilePath(fileName, true);
  try {
    const exportData = await exportEmailTemplates();
    saveJsonToFile(exportData, filePath, includeMeta);
  } catch (err) {
    printMessage(err, 'error');
  }
}

/**
 * Export all email templates to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 */
export async function exportEmailTemplatesToFiles(includeMeta = true) {
  let indicatorId;
  try {
    const exportData = Object.entries(
      (await exportEmailTemplates()).emailTemplate
    );
    indicatorId = createProgressIndicator(
      'determinate',
      exportData.length,
      'Writing email templates'
    );
    for (const [templateId, template] of exportData) {
      const fileName = getTypedFilename(templateId, EMAIL_TEMPLATE_FILE_TYPE);
      const fileData = getFileDataTemplate();
      updateProgressIndicator(indicatorId, `Exporting ${templateId}`);
      fileData.emailTemplate[templateId] = template;
      saveJsonToFile(fileData, getFilePath(fileName, true), includeMeta);
    }
    stopProgressIndicator(
      indicatorId,
      `${exportData.length} templates written.`
    );
  } catch (err) {
    stopProgressIndicator(indicatorId, `${err}`);
    printMessage(err, 'error');
  }
}

/**
 * Import email template by id from file
 * @param {string} templateId email template id
 * @param {string} file optional filename
 * @param {boolean} raw import raw data file lacking frodo export envelop
 */
export async function importEmailTemplateFromFile(
  templateId: string,
  file: string,
  raw = false
) {
  templateId = templateId.replaceAll(`${EMAIL_TEMPLATE_TYPE}/`, '');
  const filePath = getFilePath(file);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    const indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Importing ${templateId}`
    );
    if (
      (fileData.emailTemplate && fileData.emailTemplate[templateId]) ||
      (raw && getTemplateIdFromFileName(file) === templateId)
    ) {
      try {
        const emailTemplateData = raw
          ? s2sConvert(fileData)
          : fileData.emailTemplate[templateId];
        await updateEmailTemplate(templateId, emailTemplateData);
        updateProgressIndicator(indicatorId, `Importing ${templateId}`);
        stopProgressIndicator(indicatorId, `Imported ${templateId}`);
      } catch (updateEmailTemplateError) {
        stopProgressIndicator(indicatorId, `${updateEmailTemplateError}`);
        printMessage(updateEmailTemplateError, 'error');
      }
    } else {
      stopProgressIndicator(
        indicatorId,
        `Email template ${templateId} not found in ${filePath}!`
      );
      printMessage(
        `Email template ${templateId} not found in ${filePath}!`,
        'error'
      );
    }
  } catch (error) {
    printMessage(
      `Error importing email template ${templateId}: ${error}`,
      'error'
    );
  }
}

/**
 * Import all email templates from file
 * @param {string} file optional filename
 */
export async function importEmailTemplatesFromFile(file: string) {
  const filePath = getFilePath(file);
  const indicatorId = createProgressIndicator(
    'indeterminate',
    0,
    `Importing email templates from ${filePath}...`
  );
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const fileData = JSON.parse(data);
    await importEmailTemplates(fileData);
    stopProgressIndicator(
      indicatorId,
      `Successfully imported email templates from ${filePath}.`,
      'success'
    );
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing email templates from ${filePath}.`,
      'fail'
    );
    printMessage(error.response?.data || error, 'error');
  }
}

/**
 * Helper function to get email template id from file name
 * @param {string} file file name
 * @returns {string} email template id/name
 */
function getTemplateIdFromFileName(file: string) {
  debugMessage(`cli.EmailTemplateOps.getTemplateIdFromFileName: file=${file}`);
  const basename = path.basename(file);
  const keys = basename.split('-');
  if (keys[0] !== EMAIL_TEMPLATE_TYPE || keys.length <= 1)
    throw new Error(`Filename does not indicate a raw email template: ${file}`);
  const templateId = keys[1].split('.')[0];
  debugMessage(
    `cli.EmailTemplateOps.getTemplateIdFromFileName: templateId=${templateId}`
  );
  return templateId;
}

/**
 * Convert template for s2s purposes (software-to-saas migration)
 * @param {EmailTemplateSkeleton} templateData template object
 * @returns {EmailTemplateSkeleton} converted template object
 */
function s2sConvert(
  templateData: EmailTemplateSkeleton
): EmailTemplateSkeleton {
  if (templateData.message && !templateData.html) {
    const convertedData = cloneDeep(templateData);
    convertedData.html = cloneDeep(templateData.message);
    debugMessage(`cli.EmailTemplateOps.s2sConvert: templateData:`);
    debugMessage(templateData);
    debugMessage(`cli.EmailTemplateOps.s2sConvert: convertedData:`);
    debugMessage(convertedData);
    return convertedData;
  }
  return templateData;
}

/**
 * Import all email templates from separate files
 * @param {boolean} raw import raw data file lacking frodo export envelop
 */
export async function importEmailTemplatesFromFiles(raw = false) {
  const names = fs.readdirSync(getWorkingDirectory());
  const jsonFiles = names
    .filter((name) =>
      raw
        ? name.startsWith(`${EMAIL_TEMPLATE_TYPE}-`) && name.endsWith(`.json`)
        : name.toLowerCase().endsWith(`${EMAIL_TEMPLATE_FILE_TYPE}.json`)
    )
    .map((name) => getFilePath(name));
  const indicatorId = createProgressIndicator(
    'determinate',
    jsonFiles.length,
    'Importing email templates...'
  );
  let total = 0;
  let totalErrors = 0;
  for (const file of jsonFiles) {
    const data = fs.readFileSync(file, 'utf8');
    const fileData = JSON.parse(data);
    if (
      (raw && file.startsWith('emailTemplate-')) ||
      validateImport(fileData.meta)
    ) {
      let errors = 0;
      if (raw) {
        total++;
        const templateId = getTemplateIdFromFileName(file);
        try {
          const templateData = s2sConvert(fileData);
          await updateEmailTemplate(templateId, templateData);
        } catch (updateEmailTemplateError) {
          errors += 1;
          printMessage(`\nError importing ${templateId}`, 'error');
          printMessage(updateEmailTemplateError, 'error');
          printMessage(updateEmailTemplateError.response?.data, 'error');
        }
      } else {
        total += Object.keys(fileData.emailTemplate).length;
        for (const id in fileData.emailTemplate) {
          if ({}.hasOwnProperty.call(fileData.emailTemplate, id)) {
            const templateId = id.replace(regexEmailTemplateType, '');
            try {
              await updateEmailTemplate(
                templateId,
                fileData.emailTemplate[templateId]
              );
            } catch (updateEmailTemplateError) {
              errors += 1;
              printMessage(`\nError importing ${templateId}`, 'error');
              printMessage(updateEmailTemplateError.response.data, 'error');
            }
          }
        }
      }
      totalErrors += errors;
      updateProgressIndicator(indicatorId, `Imported ${file}`);
    } else {
      printMessage(`Validation of ${file} failed!`, 'error');
    }
  }
  stopProgressIndicator(
    indicatorId,
    `Imported ${total - totalErrors} of ${total} email template(s) from ${
      jsonFiles.length
    } file(s).`
  );
}

/**
 * Import first email template from file
 * @param {String} file optional filename
 */
export async function importFirstEmailTemplateFromFile(
  file: string,
  raw = false
) {
  let indicatorId: string;
  try {
    const data = fs.readFileSync(getFilePath(file), 'utf8');
    const fileData = JSON.parse(data);
    indicatorId = createProgressIndicator(
      'indeterminate',
      0,
      `Importing first email template`
    );
    if (raw) {
      try {
        const templateId = getTemplateIdFromFileName(file);
        const templateData = s2sConvert(fileData);
        await updateEmailTemplate(templateId, templateData);
        stopProgressIndicator(indicatorId, `Imported ${templateId}`, 'success');
      } catch (error) {
        stopProgressIndicator(
          indicatorId,
          `Error importing email template: ${error}`,
          'fail'
        );
        printMessage(error.response?.data, 'error');
      }
    } else {
      for (const id of Object.keys(fileData.emailTemplate)) {
        try {
          await updateEmailTemplate(
            id.replace(regexEmailTemplateType, ''),
            fileData.emailTemplate[id]
          );
          stopProgressIndicator(indicatorId, `Imported ${id}`, 'success');
        } catch (updateEmailTemplateError) {
          stopProgressIndicator(indicatorId, `Error importing ${id}`, 'fail');
          printMessage(updateEmailTemplateError.response?.data, 'error');
        }
        break;
      }
    }
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing first email template`,
      'fail'
    );
    printMessage(`Error importing first email template: ${error}`, 'error');
  }
}
