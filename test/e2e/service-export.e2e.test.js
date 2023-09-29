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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -i policyconfiguration
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --service-id policyconfiguration -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -gi dashboard
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --global --service-id dashboard -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -a
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --all --file test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -ga
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export --global --all -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -A
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo service export -gA
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

const type = 'service';

describe('frodo service export', () => {
  test('"frodo service export -i policyconfiguration": should export the service with id "policyconfiguration"', async () => {
    const exportFile = 'policyconfiguration.service.json';
    const CMD = `frodo service export -i policyconfiguration`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --service-id policyconfiguration": should export the service with id "policyconfiguration"', async () => {
    const exportFile = 'policyconfiguration.service.json';
    const CMD = `frodo service export --service-id policyconfiguration`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -gi dashboard": should export the global service with id "dashboard"', async () => {
    const exportFile = 'dashboard.service.json';
    const CMD = `frodo service export -gi dashboard`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export --global --service-id dashboard": should export the global service with id "dashboard"', async () => {
    const exportFile = 'my-dashboard.service.json';
    const CMD = `frodo service export --global --service-id dashboard -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
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

  test('"frodo service export --global --all": should export all global services to a single file', async () => {
    const exportFile = 'my-allGlobalServices.service.json';
    const CMD = `frodo service export --global --all -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo service export -A": should export all services to separate files', async () => {
    const CMD = `frodo service export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo service export -gA": should export all global services to separate files', async () => {
    const CMD = `frodo service export -gA`;
    await testExport(CMD, env, type);
  });
});
