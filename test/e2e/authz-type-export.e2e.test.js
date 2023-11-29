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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -n URL
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --type-name URL -f my-URL.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -n URL -D authzTypeExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -D authzTypeExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -a --file test.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -aD authzTypeExportTestDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type export --all-separate --directory authzTypeExportTestDir4
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

const type = 'resourcetype.authz';

describe('frodo authz type export', () => {
  test('"frodo authz type export -n URL": should export the resource type named "URL"', async () => {
    const exportFile = 'URL.resourcetype.authz.json';
    const CMD = `frodo authz type export -n URL`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export --type-name URL -f test.json": should export the resource type named "URL"', async () => {
    const exportFile = 'my-URL.resourcetype.authz.json';
    const CMD = `frodo authz type export --type-name URL -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -n URL -D authzTypeExportTestDir1": should export the resource type named "URL" to the directory authzTypeExportTestDir1', async () => {
    const exportDirectory = 'authzTypeExportTestDir1';
    const CMD = `frodo authz type export -n URL -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2"', async () => {
    const exportFile =
      '76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json';
    const CMD = `frodo authz type export --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" into file named my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json', async () => {
    const exportFile =
      'my-76656a38-5f8e-401b-83aa-4ccb74ce88d2.resourcetype.authz.json';
    const CMD = `frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -D authzTypeExportTestDir2": should export the resource type with id "76656a38-5f8e-401b-83aa-4ccb74ce88d2" into the directory authzTypeExportTestDir2', async () => {
    const exportDirectory = 'authzTypeExportTestDir2';
    const CMD = `frodo authz type export -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 -D ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo authz type export --all": should export all resource types to a single file', async () => {
    const exportFile = 'allAlphaResourceTypes.resourcetype.authz.json';
    const CMD = `frodo authz type export --all`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -a --file my-allAlphaResourceTypes.resourcetype.authz.json": should export all resource types to a single file named my-allAlphaResourceTypes.resourcetype.authz.json', async () => {
    const exportFile = 'my-allAlphaResourceTypes.resourcetype.authz.json';
    const CMD = `frodo authz type export -a --file ${exportFile}`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo authz type export -aD authzTypeExportTestDir3": should export all resource types to a single file in the directory authzTypeExportTestDir3', async () => {
    const exportDirectory = 'authzTypeExportTestDir3';
    const CMD = `frodo authz type export -aD ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });

  test('"frodo authz type export -A": should export all resource types to separate files', async () => {
    const CMD = `frodo authz type export -A`;
    await testExport(CMD, env, type);
  });

  test('"frodo authz type export --all-separate --directory authzTypeExportTestDir4": should export all resource types to separate files in the directory authzTypeExportTestDir4', async () => {
    const exportDirectory = "authzTypeExportTestDir4";
    const CMD = `frodo authz type export --all-separate --directory ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });
});
