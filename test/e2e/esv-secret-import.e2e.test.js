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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -i esv-test-secret -f test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import --secret-id esv-test-secret --file test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -i esv-test-secret -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -i esv-test-secret -f test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -a --file test/e2e/exports/all/allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -a -f allSecrets.secret.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -a -f test/e2e/exports/all/allSecrets.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -AD test/e2e/exports/all-separate/esv/secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -AD test/e2e/exports/all-separate/esv/secret --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret import -f esv-test-secret.secret.json --directory test/e2e/exports/all-separate/esv/secret
*/
import cp from 'child_process';
import { promisify } from 'util';
import { removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = {
    env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const allDirectory = 'test/e2e/exports/all';
const allSecretsFileName = 'allSecrets.secret.json';
const allSecretsExport = `${allDirectory}/${allSecretsFileName}`;
const allSeparateSecretsDirectory = `test/e2e/exports/all-separate/esv/secret`;

describe('frodo esv secret import', () => {
    test(`"frodo esv secret import -i esv-test-secret -f ${allSecretsExport}" Import secret "esv-test-secret" from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -i esv-test-secret -f ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import --secret-id esv-test-secret --file ${allSecretsExport}" Import secret "esv-test-secret" from "${allSecretsFileName}".`, async () => {
      const CMD = `frodo esv secret import --secret-id esv-test-secret --file ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -i esv-test-secret -f ${allSecretsFileName} -D ${allDirectory}" Import secret "esv-test-secret" from "${allSecretsFileName}" in directory "${allDirectory}".`, async () => {
      const CMD = `frodo esv secret import -i esv-test-secret -f ${allSecretsFileName} -D ${allDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });

    test(`"frodo esv secret import -i esv-test-secret -f ${allSecretsExport} --include-active-values" Import secret "esv-test-secret" and secret value from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -i esv-test-secret -f ${allSecretsExport} --include-active-values`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -f ${allSecretsExport}" Import first secret from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -f ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -f ${allSecretsFileName} -D ${allDirectory}" Import first secret from "${allSecretsFileName}" in directory "${allDirectory}"`, async () => {
      const CMD = `frodo esv secret import -f ${allSecretsFileName} -D ${allDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -a --file ${allSecretsExport}" Import all secrets from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -a --file ${allSecretsExport}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -a -f ${allSecretsFileName} -D ${allDirectory}" Import all secrets from "${allSecretsFileName}" in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -a -f ${allSecretsFileName} -D ${allDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -a -f ${allSecretsExport} --include-active-values" Import all secrets and secret values from "${allSecretsExport}".`, async () => {
      const CMD = `frodo esv secret import -a -f ${allSecretsExport} --include-active-values`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -AD ${allSeparateSecretsDirectory}" Import all secrets in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -AD ${allSeparateSecretsDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -AD ${allSeparateSecretsDirectory} --include-active-values" Import all secrets and secret values in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -AD ${allSeparateSecretsDirectory} --include-active-values`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
  
    test(`"frodo esv secret import -f esv-test-secret.secret.json --directory ${allSeparateSecretsDirectory}" Import first secret from "esv-test-secret.secret.json" in directory "${allSeparateSecretsDirectory}".`, async () => {
      const CMD = `frodo esv secret import -f esv-test-secret.secret.json --directory ${allSeparateSecretsDirectory}`;
      const { stdout } = await exec(CMD, env);
      expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
    });
});
