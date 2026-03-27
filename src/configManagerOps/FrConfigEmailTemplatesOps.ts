import { frodo } from '@rockcarver/frodo-lib';
import fs from 'fs';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readEmailTemplates, readEmailTemplate, importEmailTemplates } =
  frodo.email.template;
/**
 * Export an internal roles in fr-config-manager format.
 * @return {Promise<boolean>} a promise that resolves to true if successful, false otherwise
 */
export async function configManagerExportEmailTemplates(
  name?: string
): Promise<boolean> {
  try {
    if (name) {
      const exportData = await readEmailTemplate(name);
      processEmailTemplate(exportData, `email-templates`);
    } else {
      const exportData = await readEmailTemplates();
      exportData.forEach(async (template) => {
        processEmailTemplate(template, `email-templates`);
      });
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

async function processEmailTemplate(template, fileDir) {
  try {
    const templateName = template._id.split('/')[1];
    const templatePath = `${fileDir}/${templateName}`;
    await splitLangToFile(template.html, templatePath, templateName, 'html');
    await splitLangToFile(template.message, templatePath, templateName, 'md');
    if (template.styles) {
      const cssFilename = `${templateName}.css`;
      extractFrConfigDataToFile(template.styles, cssFilename, templatePath);
      template.styles = {
        file: cssFilename,
      };
    }
    const fileName = `${templatePath}/${templateName}.json`;
    saveJsonToFile(template, getFilePath(fileName, true), false, true);
  } catch (err) {
    printError(err);
  }
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
    const templateDir = getFilePath('email-templates');
    const templateFiles = fs.readdirSync(templateDir);
    const importTemplateData = { emailTemplate: {} };

    for (const templateFile of templateFiles) {
      const templateJsonPath = getFilePath(
        `email-templates/${templateFile}/${templateFile}.json`
      );
      const readTemplate = fs.readFileSync(templateJsonPath, 'utf8');
      const importData = JSON.parse(readTemplate);
      const id = importData._id;

      if (templateName && id !== `emailTemplate/${templateName}`) {
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
      importTemplateData.emailTemplate[id.replace('emailTemplate/', '')] =
        importData;
    }
    await importEmailTemplates(importTemplateData);
    return true;
  } catch (error) {
    printError(error, `Error importing email templates to files`);
  }
  return false;
}
