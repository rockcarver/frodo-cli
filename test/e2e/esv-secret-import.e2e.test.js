/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export --secret-id esv-test-secret
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
 *    $ FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export --secret-id esv-test-secret
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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -Fi esv-test-secret -f test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import --secret-id esv-test-secret --file test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -Fi esv-test-secret -f allSecrets.secret.json -D test/e2e/exports/all --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -i esv-test-secret -f test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -Ff test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -Ff esv-test-secret.secret.json --include-active-values --directory test/e2e/exports/all-separate/cloud/global/secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -Fa --file test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -a -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import --force-update --all --file test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -af test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -FAD test/e2e/exports/all-separate/cloud/global/secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -AD test/e2e/exports/all-separate/cloud/global/secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import --force-update --all-separate --directory test/e2e/exports/all-separate/cloud/global/secret --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import --all-separate --directory test/e2e/exports/all-separate/cloud/global/secret --include-active-values
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allDirectory = 'test/e2e/exports/all';
const allSecretsFileName = 'allSecrets.secret.json';
const allSecretsExport = `${allDirectory}/${allSecretsFileName}`;
const allSeparateSecretsDirectory = `test/e2e/exports/all-separate/cloud/global/secret`;

describe('frodo esv secret import', () => {
    test(`"frodo esv secret import -Fi esv-test-secret -f ${allSecretsExport}" Import secret "esv-test-secret" from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -Fi esv-test-secret -f ${allSecretsExport}`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import --secret-id esv-test-secret --file ${allSecretsExport}" Should not import secret "esv-test-secret" from "${allSecretsFileName}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import --secret-id esv-test-secret --file ${allSecretsExport}`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import -Fi esv-test-secret -f ${allSecretsFileName} -D ${allDirectory} --include-active-values" Import secret "esv-test-secret" and value from "${allSecretsFileName}" in directory "${allDirectory}".`, async () => {
      const CMD = `frodo esv secret import -Fi esv-test-secret -f ${allSecretsFileName} -D ${allDirectory} --include-active-values`;
      await testSuccess(CMD, env);
    });

    test(`"frodo esv secret import -i esv-test-secret -f ${allSecretsExport} --include-active-values" Should not import secret "esv-test-secret" and secret value from "${allSecretsExport}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import -i esv-test-secret -f ${allSecretsExport} --include-active-values`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import -Ff ${allSecretsExport}" Import first secret from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -Ff ${allSecretsExport}`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import -f ${allSecretsFileName} -D ${allDirectory}" Should not import first secret from "${allSecretsFileName}" in directory "${allDirectory}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import -f ${allSecretsFileName} -D ${allDirectory}`;
      await testSuccess(CMD, env);
    });

    test(`"frodo esv secret import -Ff esv-test-secret.secret.json --include-active-values --directory ${allSeparateSecretsDirectory}" Import first secret from "esv-test-secret.secret.json" in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -Ff esv-test-secret.secret.json --include-active-values --directory ${allSeparateSecretsDirectory}`;
      await testSuccess(CMD, env);
    });

    test(`"frodo esv secret import -f ${allSecretsExport} --include-active-values" Should not import first secret from "${allSecretsExport}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import -f ${allSecretsExport} --include-active-values`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import -Fa --file ${allSecretsExport}" Import all secrets from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -Fa --file ${allSecretsExport}`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import -a -f ${allSecretsFileName} -D ${allDirectory}" Should not import all secrets from "${allSecretsFileName}" in directory "${allSeparateSecretsDirectory}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import -a -f ${allSecretsFileName} -D ${allDirectory}`;
      await testSuccess(CMD, env);
    });

    test(`"frodo esv secret import --force-update --all --file ${allSecretsExport} --include-active-values" Import all secrets and secret values from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import --force-update --all --file ${allSecretsExport} --include-active-values`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import -af ${allSecretsExport} --include-active-values" Should not import all secrets and secret values from "${allSecretsExport}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import -af ${allSecretsExport} --include-active-values`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import -FAD ${allSeparateSecretsDirectory}" Import all secrets in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -FAD ${allSeparateSecretsDirectory}`;
      await testSuccess(CMD, env);
    });

    test(`"frodo esv secret import -AD ${allSeparateSecretsDirectory}" Should not import all secrets in directory "${allSeparateSecretsDirectory}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import -AD ${allSeparateSecretsDirectory}`;
      await testSuccess(CMD, env);
    });

    test(`"frodo esv secret import --force-update --all-separate --directory ${allSeparateSecretsDirectory} --include-active-values" Should import all secrets and secret values in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import --force-update --all-separate --directory  ${allSeparateSecretsDirectory} --include-active-values`;
      await testSuccess(CMD, env);
    });
  
    test(`"frodo esv secret import --all-separate --directory  ${allSeparateSecretsDirectory} --include-active-values" Should not import all secrets and secret values in directory "${allSeparateSecretsDirectory}" when no changes are made.`, async () => {
      const CMD = `frodo esv secret import --all-separate --directory ${allSeparateSecretsDirectory} --include-active-values`;
      await testSuccess(CMD, env);
    });
});
