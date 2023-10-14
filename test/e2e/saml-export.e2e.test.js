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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -i iSPAzure
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export --entity-id iSPAzure
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -i iSPAzure -f my-iSPAzure.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -i iSPAzure -D samlExportTestDir1
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export --all --file my-allAlphaProviders.saml.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -aD samlExportTestDir2
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export -A
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo saml export --all-separate --directory samlExportTestDir3
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

const type = 'saml';

describe('frodo saml export', () => {
  test('"frodo saml export -i iSPAzure": should export the saml provider with entity id "iSPAzure"', async () => {
    const exportFile = 'iSPAzure.saml.json';
    const CMD = `frodo saml export -i iSPAzure`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export --entity-id iSPAzure": should export the saml provider with entity id "iSPAzure"', async () => {
    const exportFile = 'iSPAzure.saml.json';
    const CMD = `frodo saml export --entity-id iSPAzure`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export -i iSPAzure -f my-iSPAzure.saml.json": should export the saml provider with entity id "iSPAzure" into file named my-iSPAzure.saml.json', async () => {
    const exportFile = 'my-iSPAzure.saml.json';
    const CMD = `frodo saml export -i iSPAzure -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export -i iSPAzure -D samlExportTestDir1": should export the saml provider with entity id "iSPAzure" into the directory samlExportTestDir1', async () => {
    const exportDirectory = 'samlExportTestDir1';
    const CMD = `frodo saml export -i iSPAzure -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo saml export -a": should export all saml providers to a single file', async () => {
    const exportFile = 'allAlphaProviders.saml.json';
    const CMD = `frodo saml export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export --all --file my-allAlphaProviders.saml.json": should export all saml providers to a single file named my-allAlphaProviders.saml.json', async () => {
    const exportFile = 'my-allAlphaProviders.saml.json';
    const CMD = `frodo saml export --all --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo saml export -aD samlExportTestDir2": should export all saml providers to a single file in the directory samlExportTestDir2', async () => {
    const exportDirectory = 'samlExportTestDir2';
    const CMD = `frodo saml export -aD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo saml export -A": should export all saml providers to separate files', async () => {
    const CMD = `frodo saml export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo saml export --all-separate --directory samlExportTestDir3": should export all saml providers to separate files in the directory samlExportTestDir3', async () => {
    const exportDirectory = 'samlExportTestDir3';
    const CMD = `frodo saml export --all-separate --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });
});
