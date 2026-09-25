/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --raw -i welcome -f emailTemplate-welcome.json -D test/e2e/exports/all-separate/raw
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --template-id welcome --file test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --raw -f emailTemplate-welcome.json -D test/e2e/exports/all-separate/raw
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --file test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import -af test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --all --file test/e2e/exports/all/allEmailTemplates.template.email.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import -af allEmailTemplates.template.email.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --raw -AD test/e2e/exports/all-separate/raw
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template import --all-separate --directory test/e2e/exports/all-separate/cloud/global/emailTemplate
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

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
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import --template-id welcome --file ${allAlphaEmailTemplatesExport}": should import the email template with the id "welcome" from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import --template-id welcome --file ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import --raw -f ${emailTemplateWelcomeRawFileName} -D ${allSeparateEmailTemplatesRawDirectory}": should import the first email template from the file "${emailTemplateWelcomeRawExport}"`, async () => {
    const CMD = `frodo email template import --raw -f ${emailTemplateWelcomeRawFileName} -D ${allSeparateEmailTemplatesRawDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import --file ${allAlphaEmailTemplatesExport}": should import the first email template from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import --file ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import -af ${allAlphaEmailTemplatesExport}": should import all email templates from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import -af ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import --all --file ${allAlphaEmailTemplatesExport}": should import all email templates from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import --all --file ${allAlphaEmailTemplatesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import -af ${allAlphaEmailTemplatesFileName} -D ${allDirectory}": should import all email templates from the file "${allAlphaEmailTemplatesExport}"`, async () => {
    const CMD = `frodo email template import -af ${allAlphaEmailTemplatesFileName} -D ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import --raw -AD ${allSeparateEmailTemplatesRawDirectory}": should import all email templates from the ${allSeparateEmailTemplatesRawDirectory} directory"`, async () => {
    const CMD = `frodo email template import --raw -AD ${allSeparateEmailTemplatesRawDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo email template import --all-separate --directory ${allSeparateEmailTemplatesDirectory}": should import all email templates from the ${allSeparateEmailTemplatesDirectory} directory"`, async () => {
    const CMD = `frodo email template import --all-separate --directory ${allSeparateEmailTemplatesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
});
