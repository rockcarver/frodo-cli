/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export --template-id welcome
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -i welcome -f my-welcome.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -Ni welcome -D emailTemplateExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export --all --file my-allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -NaD emailTemplateExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export --all-separate --no-metadata --directory emailTemplateExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'template.email';

describe('frodo email template export', () => {
  test('"frodo email template export --template-id welcome": should export the email template with email id "welcome"', async () => {
    const exportFile = 'welcome.template.email.json';
    const CMD = `frodo email template export --template-id welcome`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export -i welcome -f my-welcome.template.email.json": should export the email template with email id "welcome" into file named my-welcome.template.email.json', async () => {
    const exportFile = 'my-welcome.template.email.json';
    const CMD = `frodo email template export -i welcome -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export -Ni welcome -D emailTemplateExportTestDir1": should export the email template with email id "welcome" into the directory emailTemplateExportTestDir1', async () => {
    const exportDirectory = 'emailTemplateExportTestDir1';
    const CMD = `frodo email template export -Ni welcome -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo email template export -a": should export all email templates to a single file', async () => {
    const exportFile = 'allEmailTemplates.template.email.json';
    const CMD = `frodo email template export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export --all --file my-allEmailTemplates.template.email.json": should export all email templates to a single file named my-allEmailTemplates.template.email.json', async () => {
    const exportFile = 'my-allEmailTemplates.template.email.json';
    const CMD = `frodo email template export --all --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export -NaD emailTemplateExportTestDir2": should export all email templates to a single file in the directory emailTemplateExportTestDir2', async () => {
    const exportDirectory = 'emailTemplateExportTestDir2';
    const CMD = `frodo email template export -NaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo email template export -A": should export all email templates to separate files', async () => {
    const CMD = `frodo email template export -A`;
    await testExport(CMD, env, type);
  });
  test('"frodo email template export --all-separate --no-metadata --directory emailTemplateExportTestDir3": should export all email templates to separate files in the directory emailTemplateExportTestDir3', async () => {
    const exportDirectory = 'emailTemplateExportTestDir3';
    const CMD = `frodo email template export --all-separate --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });
});
