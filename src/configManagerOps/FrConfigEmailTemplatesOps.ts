import fs from 'fs';
import { frodo } from '@rockcarver/frodo-lib';
import { extractFrConfigDataToFile } from '../utils/Config';
import {
  nameInFolder,
  nameInStem,
  pulledFilePath,
  PulledPaths,
  referencedFilePath,
} from '../utils/ConfigTreePath';
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
    const pulledPaths = new PulledPaths();
    for (const template of templates) {
      const templateName = template._id.split('/')[1];
      await run.run(templateName, async () => {
        // the tenant names the template: its name is the name of its folder and its files here, never a path; the name is
        // made once, with the longest ending of the files of the template
        const ending = longestEnding(template);
        const folderName = nameInFolder(templateName, ending);
        // a file reference starts with the name of the template, so it is the stem of the names of the files
        const stem = nameInStem(templateName, ending);
        const templatePath = `email-templates/${folderName}`;
        const languages = [
          ...plannedLanguages(template.html, stem, 'html'),
          ...plannedLanguages(template.message, stem, 'md'),
        ];
        const cssFilename = `${stem}.css`;
        const jsonFile = `${templatePath}/${folderName}.json`;
        // every file is checked before the first one is written
        for (const { language, fileName } of languages) {
          pulledPaths.owner = `${templateName}.${language}`;
          pulledFilePath(`${templatePath}/${fileName}`, pulledPaths);
        }
        if (template.styles) {
          pulledPaths.owner = `${templateName}.css`;
          pulledFilePath(`${templatePath}/${cssFilename}`, pulledPaths);
        }
        pulledPaths.owner = templateName;
        pulledFilePath(jsonFile, pulledPaths);

        for (const { property, language, fileName, text } of languages) {
          pulledPaths.owner = `${templateName}.${language}`;
          extractFrConfigDataToFile(text, fileName, templatePath, pulledPaths);
          property[language] = {
            file: fileName,
          };
        }
        if (template.styles) {
          pulledPaths.owner = `${templateName}.css`;
          extractFrConfigDataToFile(
            template.styles,
            cssFilename,
            templatePath,
            pulledPaths
          );
          template.styles = {
            file: cssFilename,
          };
        }
        pulledPaths.owner = templateName;
        saveJsonToFile(
          template,
          getFilePath(pulledFilePath(jsonFile, pulledPaths), true),
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

/**
 * The longest ending that a file of one email template has after the name of the template: `.json` for the file of the
 * template, `.<language>.html` and `.<language>.md` for each page and message, and `.css` for the styles.
 * @param {{ html?: Record<string, unknown>, message?: Record<string, unknown>, styles?: unknown }} template the template, as the tenant has it
 * @returns {string} the longest ending
 */
function longestEnding(template: {
  html?: Record<string, unknown>;
  message?: Record<string, unknown>;
  styles?: unknown;
}): string {
  const endings = [
    '.json',
    ...(template.styles ? ['.css'] : []),
    ...Object.keys(template.html ?? {}).map((l) => `.${nameInFolder(l)}.html`),
    ...Object.keys(template.message ?? {}).map((l) => `.${nameInFolder(l)}.md`),
  ];
  return endings.reduce((longest, ending) =>
    Buffer.byteLength(ending) > Buffer.byteLength(longest) ? ending : longest
  );
}

/**
 * The files of the languages of one property of a template (`html` or `message`): the name of each
 * file is the stem of the template, the language, and the suffix. The language is a name that the
 * tenant gives, so it is one name here, never a path.
 * @param {Record<string, unknown> | undefined} property the languages of the property, by language
 * @param {string} stem the start of the name of every file of the template
 * @param {string} suffix the extension of the files, without the dot
 * @returns {{ property: Record<string, unknown>; language: string; fileName: string; text: unknown }[]} one entry for each language
 * @throws {Error} if a language is not a name that a file can have
 */
function plannedLanguages(
  property: Record<string, unknown> | undefined,
  stem: string,
  suffix: string
): {
  property: Record<string, unknown>;
  language: string;
  fileName: string;
  text: unknown;
}[] {
  if (!property) return [];
  return Object.entries(property).map(([language, text]) => ({
    property,
    language,
    fileName: `${stem}.${nameInFolder(language)}.${suffix}`,
    text,
  }));
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
    // `.` and `..` name no email template: the words of a pull
    if (templateName) nameInFolder(templateName);
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
              referencedFilePath(
                `email-templates/${templateFile}`,
                importData.html[locale].file
              )
            );
            importData.html[locale] = fs.readFileSync(htmlFilePath, 'utf8');
          }
        }
        if (importData.message && typeof importData.message === 'object') {
          for (const locale in importData.message) {
            const messageFilePath = getFilePath(
              referencedFilePath(
                `email-templates/${templateFile}`,
                importData.message[locale].file
              )
            );
            importData.message[locale] = fs.readFileSync(
              messageFilePath,
              'utf8'
            );
          }
        }
        if (importData.styles && typeof importData.styles === 'object') {
          const stylesFilePath = getFilePath(
            referencedFilePath(
              `email-templates/${templateFile}`,
              importData.styles.file
            )
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
