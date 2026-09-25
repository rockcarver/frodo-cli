/** See test/e2e/README.md for how to write and record e2e tests. */

/*
To create sample data, run these:

FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret create -i esv-test-secret --value "test secret value" --description "This is a test secret containing a simple string value."

To record, run these:

FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export --secret-id esv-test-secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -i esv-test-secret -f my-esv-test-secret_value.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -i esv-test-secret -f my-esv-test-secret_value-frodo-dev.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -i esv-test-secret -f my-esv-test-secret.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -MNi esv-test-secret -D secretExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -a -f myAllSecrets_values.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -a -f myAllSecrets_values-frodo-dev.secret.json --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -a --file my-allSecrets.secret.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -MNaD secretExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export --modified-properties --all-separate --no-metadata --directory secretExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -AD secretExportTestDir4 --include-active-values
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret export -AD secretExportTestDir5 --include-active-values
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'secret';

describe('frodo esv secret export', () => {
  test('"frodo esv secret export --secret-id esv-test-secret": should export the secret with secret id "esv-test-secret"', async () => {
    const exportFile = 'esv-test-secret.secret.json';
    const CMD = `frodo esv secret export --secret-id esv-test-secret`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -i esv-test-secret -f my-esv-test-secret_value.secret.json --include-active-values": should export the secret with secret id "esv-test-secret" including secret value into file named my-esv-test-secret_value.secret.json', async () => {
    const exportFile = 'my-esv-test-secret_value.secret.json';
    const CMD = `frodo esv secret export -i esv-test-secret -f ${exportFile} --include-active-values`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -i esv-test-secret -f my-esv-test-secret_value-frodo-dev.secret.json --include-active-values": should export the secret with secret id "esv-test-secret" including secret value into file named my-esv-test-secret_value-frodo-dev.secret.json', async () => {
    const exportFile = 'my-esv-test-secret_value-frodo-dev.secret.json';
    const CMD = `frodo esv secret export -i esv-test-secret -f ${exportFile} --include-active-values`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -i esv-test-secret -f my-esv-test-secret.secret.json": should export the secret with secret id "esv-test-secret" into file named my-esv-test-secret.secret.json', async () => {
    const exportFile = 'my-esv-test-secret.secret.json';
    const CMD = `frodo esv secret export -i esv-test-secret -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -MNi esv-test-secret -D secretExportTestDir1": should export the secret with secret id "esv-test-secret" into the directory named secretExportTestDir1', async () => {
    const exportDirectory = 'secretExportTestDir1';
    const CMD = `frodo esv secret export -MNi esv-test-secret -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo esv secret export --all": should export all secrets to a single file', async () => {
    const exportFile = 'allSecrets.secret.json';
    const CMD = `frodo esv secret export --all`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -a -f myAllSecrets_values.secret.json --include-active-values": should export all secrets including secret values to a single file named myAllSecrets_values.secret.json', async () => {
    const exportFile = 'myAllSecrets_values.secret.json';
    const CMD = `frodo esv secret export -a -f ${exportFile} --include-active-values`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -a -f myAllSecrets_values-frodo-dev.secret.json --include-active-values": should export all secrets including secret values to a single file named myAllSecrets_values-frodo-dev.secret.json', async () => {
    const exportFile = 'myAllSecrets_values-frodo-dev.secret.json';
    const CMD = `frodo esv secret export -a -f ${exportFile} --include-active-values`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -a --file my-allSecrets.secret.json": should export all secrets to a single file named my-allSecrets.secret.json', async () => {
    const exportFile = 'my-allSecrets.secret.json';
    const CMD = `frodo esv secret export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo esv secret export -MNaD secretExportTestDir2": should export all secrets to a single file in the directory secretExportTestDir2', async () => {
    const exportDirectory = 'secretExportTestDir2';
    const CMD = `frodo esv secret export -MNaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo esv secret export -A": should export all secrets to separate files', async () => {
    const CMD = `frodo esv secret export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo esv secret export --modified-properties --all-separate --no-metadata --directory secretExportTestDir3": should export all secrets to separate files in the directory secretExportTestDir3', async () => {
    const exportDirectory = 'secretExportTestDir3';
    const CMD = `frodo esv secret export --modified-properties --all-separate --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo esv secret export -AD secretExportTestDir4 --include-active-values": should export all secrets including secret values to separate files in the directory secretExportTestDir4', async () => {
    const exportDirectory = 'secretExportTestDir4';
    const CMD = `frodo esv secret export -AD ${exportDirectory} --include-active-values`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo esv secret export -AD secretExportTestDir5 --include-active-values": should export all secrets including secret values to separate files in the directory secretExportTestDir5', async () => {
    const exportDirectory = 'secretExportTestDir5';
    const CMD = `frodo esv secret export -AD ${exportDirectory} --include-active-values`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });
});
