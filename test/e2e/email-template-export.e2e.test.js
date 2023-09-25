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

/*
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export -i activation
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export --template-id activation
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export -i activation -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export --all
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export -a --file test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export -A
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_SA_ID=b672336b-41ef-428d-ae4a-e0c082875377 FRODO_SA_JWK=$(<~/Downloads/frodo-test_privateKey.jwk) frodo email template export --all-separate
*/

/*
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -i activation
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export --template-id activation
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -i activation -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -a --file test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo email template export -A
*/
import { testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = {
  env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const type = 'template.email';

describe('frodo email template export', () => {
  test('"frodo email template export -i activation": should export the email template with email id "activation"', async () => {
    const exportFile = 'activation.template.email.json';
    const CMD = `frodo email template export -i activation`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export --template-id activation": should export the email template with email id "activation"', async () => {
    const exportFile = 'activation.template.email.json';
    const CMD = `frodo email template export --template-id activation`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export -i activation -f my-activation.template.email.json": should export the email template with email id "activation" into file named my-activation.template.email.json', async () => {
    const exportFile = 'my-activation.template.email.json';
    const CMD = `frodo email template export -i activation -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export -a": should export all email templates to a single file', async () => {
    const exportFile = 'allEmailTemplates.template.email.json';
    const CMD = `frodo email template export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export -a --file my-allEmailTemplates.template.email.json": should export all email templates to a single file named my-allEmailTemplates.template.email.json', async () => {
    const exportFile = 'my-allEmailTemplates.template.email.json';
    const CMD = `frodo email template export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo email template export -A": should export all email templates to separate files', async () => {
    const CMD = `frodo email template export -A`;
    await testExport(CMD, env, type);
  });
});
