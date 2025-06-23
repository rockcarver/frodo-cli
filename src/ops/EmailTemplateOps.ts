import { frodo, FrodoError } from '@rockcarver/frodo-lib';
import { EmailTemplateSkeleton } from '@rockcarver/frodo-lib/types/ops/EmailTemplateOps';
import fs from 'fs';
import path from 'path';

import {
  createProgressIndicator,
  createTable,
  debugMessage,
  failSpinner,
  printError,
  printMessage,
  showSpinner,
  stopProgressIndicator,
  succeedSpinner,
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
  deleteEmailTemplate,
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
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function listEmailTemplates(
  long: boolean = false
): Promise<boolean> {
  let emailTemplates = [];
  try {
    emailTemplates = await readEmailTemplates(true);
  } catch (error) {
    printError(error);
    return false;
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
  return true;
}

/**
 * Export single email template to a file
 * @param {string} templateId email template id to export
 * @param {string} file filename where to export the template data
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEmailTemplateToFile(
  templateId: string,
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  let indicatorId: string;
  try {
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(templateId, EMAIL_TEMPLATE_FILE_TYPE);
    }
    const filePath = getFilePath(fileName, true);
    indicatorId = createProgressIndicator(
      'determinate',
      1,
      `Exporting ${templateId}`
    );
    const templateData = await readEmailTemplate(templateId);
    updateProgressIndicator(indicatorId, `Writing file ${filePath}`);
    const fileData = getFileDataTemplate();
    fileData.emailTemplate[templateId] = templateData;
    saveJsonToFile(fileData, filePath, includeMeta);
    stopProgressIndicator(
      indicatorId,
      `Exported ${templateId['brightCyan']} to ${filePath['brightCyan']}.`
    );
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error}`);
    printError(error);
  }
  return false;
}

/**
 * Export all email templates to file
 * @param {string} file optional filename
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEmailTemplatesToFile(
  file: string,
  includeMeta: boolean = true
): Promise<boolean> {
  try {
    let fileName = file;
    if (!fileName) {
      fileName = getTypedFilename(
        `allEmailTemplates`,
        EMAIL_TEMPLATE_FILE_TYPE
      );
    }
    const filePath = getFilePath(fileName, true);
    const exportData = await exportEmailTemplates(true);
    saveJsonToFile(exportData, filePath, includeMeta);
    return true;
  } catch (error) {
    printError(error);
  }
  return false;
}

/**
 * Export all email templates to separate files
 * @param {boolean} includeMeta true to include metadata, false otherwise. Default: true
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function exportEmailTemplatesToFiles(
  includeMeta: boolean = true
): Promise<boolean> {
  let indicatorId;
  try {
    const exportData = Object.entries(
      (await exportEmailTemplates(true)).emailTemplate
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
    return true;
  } catch (error) {
    stopProgressIndicator(indicatorId, `${error}`);
    printError(error);
  }
  return false;
}

/**
 * Import email template by id from file
 * @param {string} templateId email template id
 * @param {string} file optional filename
 * @param {boolean} raw import raw data file lacking frodo export envelop
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEmailTemplateFromFile(
  templateId: string,
  file: string,
  raw: boolean = false
): Promise<boolean> {
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
        return true;
      } catch (error) {
        stopProgressIndicator(indicatorId, `${error}`);
        printError(error);
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
    printError(error);
  }
  return false;
}

/**
 * Import all email templates from file
 * @param {string} file optional filename
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEmailTemplatesFromFile(
  file: string
): Promise<boolean> {
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
    return true;
  } catch (error) {
    stopProgressIndicator(
      indicatorId,
      `Error importing email templates from ${filePath}.`,
      'fail'
    );
    printError(error);
  }
  return false;
}

/**
 * Helper function to get email template id from file name
 * @param {string} file file name
 * @returns {string} email template id/name
 */
function getTemplateIdFromFileName(file: string): string {
  debugMessage(`cli.EmailTemplateOps.getTemplateIdFromFileName: file=${file}`);
  const basename = path.basename(file);
  const keys = basename.split('-');
  if (keys[0] !== EMAIL_TEMPLATE_TYPE || keys.length <= 1)
    throw new FrodoError(
      `Filename does not indicate a raw email template: ${file}`
    );
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
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importEmailTemplatesFromFiles(
  raw: boolean = false
): Promise<boolean> {
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
        } catch (error) {
          errors += 1;
          printError(error);
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
            } catch (error) {
              errors += 1;
              printError(error);
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
  if (totalErrors === 0) return true;
  return false;
}

/**
 * Import first email template from file
 * @param {string} file optional filename
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function importFirstEmailTemplateFromFile(
  file: string,
  raw: boolean = false
): Promise<boolean> {
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
        return true;
      } catch (error) {
        stopProgressIndicator(
          indicatorId,
          `Error importing email template: ${error}`,
          'fail'
        );
        printError(error);
      }
    } else {
      for (const id of Object.keys(fileData.emailTemplate)) {
        try {
          await updateEmailTemplate(
            id.replace(regexEmailTemplateType, ''),
            fileData.emailTemplate[id]
          );
          stopProgressIndicator(indicatorId, `Imported ${id}`, 'success');
          return true;
        } catch (error) {
          stopProgressIndicator(indicatorId, `Error importing ${id}`, 'fail');
          printError(error);
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
    printError(error);
  }
  return false;
}

/**
 * Delete email template by id
 * @param {string} templateId email template id/name
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteEmailTemplateById(
  templateId: string
): Promise<boolean> {
  debugMessage(`cli.EmailTemplateOps.deleteEmailTemplateById: begin`);
  showSpinner(`Deleting ${templateId}...`);
  try {
    debugMessage(`Deleting email template ${templateId}`);
    await deleteEmailTemplate(templateId);
    succeedSpinner(`Deleted ${templateId}.`);
    debugMessage(`cli.EmailTemplateOps.deleteEmailTemplateById: end`);
    return true;
  } catch (error) {
    failSpinner(`Error deleting email template ${templateId}`);
    printError(error);
  }
  return false;
}

/**
 * Delete all email templates
 * @returns {Promise<boolean>} true if successful, false otherwise
 */
export async function deleteAllEmailTemplates(): Promise<boolean> {
  debugMessage(`cli.EmailTemplateOps.deleteAllEmailTemplates: begin`);
  const errors = [];
  let templates: EmailTemplateSkeleton[] = [];
  let indicatorId: string;
  try {
    showSpinner(`Retrieving all email templates...`);
    try {
      templates = await readEmailTemplates(true);
      succeedSpinner(`Found ${templates.length} email templates.`);
    } catch (error) {
      failSpinner(`Error retrieving all email templates`);
      throw new FrodoError(`Error retrieving all email templates`, error);
    }
    if (templates.length)
      indicatorId = createProgressIndicator(
        'determinate',
        templates.length,
        `Deleting ${templates.length} email templates...`
      );
    for (const template of templates) {
      const templateId = template._id.split('/')[1];
      try {
        debugMessage(`Deleting email template ${templateId}`);
        await deleteEmailTemplate(templateId);
        updateProgressIndicator(indicatorId, `Deleted ${templateId}`);
      } catch (error) {
        errors.push(
          new FrodoError(`Error deleting email template ${templateId}`, error)
        );
      }
    }
  } catch (error) {
    errors.push(new FrodoError(`Error deleting all email templates`, error));
  } finally {
    if (errors.length > 0) {
      if (templates.length)
        stopProgressIndicator(
          indicatorId,
          `Error deleting all email templates`,
          'fail'
        );
      for (const error of errors) {
        printError(error);
      }
    } else {
      if (templates.length)
        stopProgressIndicator(
          indicatorId,
          `Deleted ${templates.length} email templates.`
        );
    }
  }
  debugMessage(`cli.EmailTemplateOps.deleteAllEmailTemplates: end`);
  return errors.length === 0;
}
