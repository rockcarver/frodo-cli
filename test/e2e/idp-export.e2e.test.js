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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export --idp-id google
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -i google -f my-google.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -Ni google -D idpExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -a --file my-allAlphaProviders.idp.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -NaD idpExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idp export --all-separate --no-metadata --directory idpExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'idp';

describe('frodo idp export', () => {
  test('"frodo idp export --idp-id google": should export the idp provider with idp id "google"', async () => {
    const exportFile = 'google.idp.json';
    const CMD = `frodo idp export --idp-id google`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -i google -f my-google.idp.json": should export the idp provider with idp id "google" into file named my-google.idp.json', async () => {
    const exportFile = 'my-google.idp.json';
    const CMD = `frodo idp export -i google -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -Ni google -D idpExportTestDir1": should export the idp provider with idp id "google" into the directory idpExportTestDir1', async () => {
    const exportDirectory = 'idpExportTestDir1';
    const CMD = `frodo idp export -Ni google -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo idp export --all": should export all idp providers to a single file', async () => {
    const exportFile = 'allAlphaProviders.idp.json';
    const CMD = `frodo idp export --all`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -a --file my-allAlphaProviders.idp.json": should export all idp providers to a single file named my-allAlphaProviders.idp.json', async () => {
    const exportFile = 'my-allAlphaProviders.idp.json';
    const CMD = `frodo idp export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo idp export -NaD idpExportTestDir2": should export all idp providers to a single file in the directory idpExportTestDir2', async () => {
    const exportDirectory = 'idpExportTestDir2';
    const CMD = `frodo idp export -NaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo idp export -A": should export all idp providers to separate files', async () => {
    const CMD = `frodo idp export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo idp export --all-separate --no-metadata --directory idpExportTestDir3": should export all idp providers to separate files in the directory idpExportTestDir3', async () => {
    const exportDirectory = "idpExportTestDir3";
    const CMD = `frodo idp export --all-separate --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });
});
