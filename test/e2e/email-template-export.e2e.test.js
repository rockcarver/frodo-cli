/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

/* Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export --template-id welcome
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -i welcome -f my-welcome.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -Ni welcome -D emailTemplateExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export --all --file my-allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -NaD emailTemplateExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export --all-separate --no-metadata --directory emailTemplateExportTestDir3

// IDM
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo email template export -AD testDir4 -m idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo email template export -aD testDir5 -m idm

*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c, idm_connection as ic } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const idmenv = getEnv(ic);
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
  test('"frodo email template export -AD emailTemplateExportTestDir4 -m idm": should export all email templates to separate files in the directory emailTemplateExportTestDir3', async () => {
    const exportDirectory = 'emailTemplateExportTestDir4';
    const CMD = `frodo email template export -AD emailTemplateExportTestDir4 -m idm`;
    await testExport(CMD, idmenv, type, undefined, exportDirectory, false);
  });
  test('"frodo email template export -aD emailTemplateExportTestDir5 -m idm": should export all email templates to separate files in the directory emailTemplateExportTestDir3', async () => {
    const exportDirectory = 'emailTemplateExportTestDir5';
    const CMD = `frodo email template export -aD emailTemplateExportTestDir5 -m idm`;
    await testExport(CMD, idmenv, type, undefined, exportDirectory, false);
  });
});
