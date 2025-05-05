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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --raw -i welcome -f emailTemplate-welcome.json -D test/e2e/exports/all-separate/raw
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --template-id welcome --file test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --raw -f emailTemplate-welcome.json -D test/e2e/exports/all-separate/raw
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --file test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import -af test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --all --file test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import -af allEmailTemplates.template.email.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --raw -AD test/e2e/exports/all-separate/raw
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --all-separate --directory test/e2e/exports/all-separate/cloud/global/emailTemplate

// IDM
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo email template import -af test/e2e/exports/all/idm/allEmailTemplates.template.email.json -m idm
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openidm-frodo-dev.classic.com:9080/openidm frodo email template import -AD test/e2e/exports/all-separate/idm/global/emailTemplate -m idm
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c , idm_connection as ic  } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);
const idmenv = getEnv(ic);

const allDirectory = 'test/e2e/exports/all';
const allAlphaEmailTemplatesFileName = 'allEmailTemplates.template.email.json';
const allAlphaEmailTemplatesExport = `${allDirectory}/${allAlphaEmailTemplatesFileName}`;
const allSeparateEmailTemplatesDirectory = `test/e2e/exports/all-separate/cloud/global/emailTemplate`;
const allSeparateEmailTemplatesRawDirectory = `test/e2e/exports/all-separate/raw`;
const emailTemplateWelcomeRawFileName = 'emailTemplate-welcome.json';
const emailTemplateWelcomeRawExport = `${allSeparateEmailTemplatesRawDirectory}/${emailTemplateWelcomeRawFileName}`;

describe('frodo email template import', () => {
  test(`"frodo email template import --raw -i welcome -f ${emailTemplateWelcomeRawFileName} -D ${allSeparateEmailTemplatesRawDirectory}": should import the email template with the id "welcome" from the file "${emailTemplateWelcomeRawExport}"`, async () => {
    const CMD = `frodo email template import --raw -i welcome -f ${emailTemplateWelcomeRawFileName} -D ${allSeparateEmailTemplatesRawDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import --template-id welcome --file ${allAlphaEmailTemplatesExport}": should import the email template with the id "welcome" from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import --template-id welcome --file ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import --raw -f ${emailTemplateWelcomeRawFileName} -D ${allSeparateEmailTemplatesRawDirectory}": should import the first email template from the file "${emailTemplateWelcomeRawExport}"`, async () => {
    const CMD = `frodo email template import --raw -f ${emailTemplateWelcomeRawFileName} -D ${allSeparateEmailTemplatesRawDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import --file ${allAlphaEmailTemplatesExport}": should import the first email template from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import --file ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import -af ${allAlphaEmailTemplatesExport}": should import all email templates from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import -af ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import --all --file ${allAlphaEmailTemplatesExport}": should import all email templates from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import --all --file ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import -af ${allAlphaEmailTemplatesFileName} -D ${allDirectory}": should import all email templates from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import -af ${allAlphaEmailTemplatesFileName} -D ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import --raw -AD ${allSeparateEmailTemplatesRawDirectory}": should import all email templates from the ${allSeparateEmailTemplatesRawDirectory} directory"`, async () => {
    const CMD = `frodo email template import --raw -AD ${allSeparateEmailTemplatesRawDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import --all-separate --directory ${allSeparateEmailTemplatesDirectory}": should import all email templates from the ${allSeparateEmailTemplatesDirectory} directory"`, async () => {
    const CMD = `frodo email template import --all-separate --directory ${allSeparateEmailTemplatesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });
  test(`"frodo email template import -af test/e2e/exports/all/idm/allEmailTemplates.template.email.json -m idm": should import email template for on prem idm from one file`, async () => {
    const CMD = `frodo email template import -af test/e2e/exports/all/idm/allEmailTemplates.template.email.json -m idm`;
    const { stdout } = await exec(CMD, idmenv);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo email template import -AD test/e2e/exports/all-separate/idm/global/emailTemplate -m idm": should import all on prem idm email templates from the directory"`, async () => {
    const CMD = `frodo email template import -AD test/e2e/exports/all-separate/idm/global/emailTemplate -m idm`;
    const { stdout } = await exec(CMD, idmenv);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });
});
