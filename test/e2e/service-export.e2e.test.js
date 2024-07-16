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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -i policyconfiguration
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --service-id policyconfiguration -f my-policyconfiguration.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -Ni policyconfiguration -D serviceExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -gi dashboard
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --global --service-id dashboard -f my-dashboard.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -Ngi dashboard -D serviceExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --all --file my-allAlphaServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -ga
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --global --all -f my-allGlobalServices.service.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -NaD serviceExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -g --all-separate
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -A --no-metadata --directory serviceExportTestDir4
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'service';

describe('frodo service export', () => {
  test('"frodo service export -i policyconfiguration": should export the service with id "policyconfiguration"', async () => {
    const exportFile = 'policyconfiguration.service.json';
    const CMD = `frodo service export -i policyconfiguration`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --service-id policyconfiguration -f my-policyconfiguration.service.json": should export the service with id "policyconfiguration" to the file my-policyconfiguration.service.json', async () => {
    const exportFile = 'my-policyconfiguration.service.json';
    const CMD = `frodo service export --service-id policyconfiguration -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -Ni policyconfiguration -D serviceExportTestDir1": should export the service with id "policyconfiguration" to the directory serviceExportTestDir1', async () => {
    const exportDirectory = 'serviceExportTestDir1';
    const CMD = `frodo service export -Ni policyconfiguration -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo service export -gi dashboard": should export the global service with id "dashboard"', async () => {
    const exportFile = 'dashboard.service.json';
    const CMD = `frodo service export -gi dashboard`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --global --service-id dashboard -f my-dashboard.service.json": should export the global service with id "dashboard" to the file my-dashboard.service.json', async () => {
    const exportFile = 'my-dashboard.service.json';
    const CMD = `frodo service export --global --service-id dashboard -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -Ngi dashboard -D serviceExportTestDir2": should export the global service with id "dashboard" to the directory serviceExportTestDir2', async () => {
    const exportDirectory = 'serviceExportTestDir2';
    const CMD = `frodo service export -Ngi dashboard -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo service export -a": should export all services to a single file', async () => {
    const exportFile = 'allAlphaServices.service.json';
    const CMD = `frodo service export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --all --file my-allAlphaServices.service.json": should export all services to a single file named my-allAlphaServices.service.json', async () => {
    const exportFile = 'my-allAlphaServices.service.json';
    const CMD = `frodo service export --all --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -ga": should export all global services to a single file', async () => {
    const exportFile = 'allGlobalServices.service.json';
    const CMD = `frodo service export -ga`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --global --all -f my-allGlobalServices.service.json": should export all global services to a single file named my-allGlobalServices.service.json', async () => {
    const exportFile = 'my-allGlobalServices.service.json';
    const CMD = `frodo service export --global --all -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -NaD serviceExportTestDir3": should export all services to a single file in the directory serviceExportTestDir3', async () => {
    const exportDirectory = 'serviceExportTestDir3';
    const CMD = `frodo service export -NaD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo service export -A": should export all services to separate files', async () => {
    const CMD = `frodo service export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo service export -g --all-separate": should export all global services to separate files', async () => {
    const CMD = `frodo service export -g --all-separate`;
    await testExport(CMD, env, type);
  });

  test('"frodo service export -A --no-metadata --directory serviceExportTestDir4": should export all services to separate files in the directory serviceExportTestDir4', async () => {
    const exportDirectory = "serviceExportTestDir4";
    const CMD = `frodo service export -A --no-metadata --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

});
