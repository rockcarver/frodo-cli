import { frodo } from '@rockcarver/frodo-lib';

import { extractFrConfigDataToFile } from '../utils/Config';
import { printError } from '../utils/Console';

const { getFilePath, saveJsonToFile } = frodo.utils;
const { readEmailTemplates, readEmailTemplate } = frodo.email.template;
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
      processEmailTemplate(exportData, `/email-templates`);
    } else {
      const exportData = await readEmailTemplates();
      exportData.forEach(async (template) => {
        processEmailTemplate(template, `/email-templates`);
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
