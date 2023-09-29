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
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm export --name script
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm export -N script -f test.json
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm export -AD testDir1
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm export -AD testDir2 -E test/e2e/env/testEntitiesFile.json -e test/e2e/env/testEnvFile.env
FRODO_MOCK=record FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm export --all-separate --directory testDir3 --entities-file test/e2e/env/testEntitiesFile.json --env-file test/e2e/env/testEnvFile.env
*/
import { testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';
import fs from 'fs';

process.env['FRODO_MOCK'] = '1';
const env = {
  env: process.env,
};
env.env.FRODO_HOST = c.host;
env.env.FRODO_SA_ID = c.saId;
env.env.FRODO_SA_JWK = c.saJwk;

const type = 'idm';

describe('frodo idm export', () => {
  test('"frodo idm export --name script": should export the idm config entity with idm id "script"', async () => {
    const exportFile = 'script.idm.json';
    const CMD = `frodo idm export --name script`;
    await testExport(CMD, env, type, exportFile, undefined, false);
  });

  test('"frodo idm export -N script -f my-script.idm.json": should export the idm config entity with idm id "script" into file named my-script.idm.json', async () => {
    const exportFile = 'my-script.idm.json';
    const CMD = `frodo idm export -N script -f ${exportFile}`;
    await testExport(CMD, env, type, exportFile, undefined, false);
  });

  test('"frodo idm export -AD testDir1": should export all idm config entities to separate files in the "testDir" directory', async () => {
    const dirName = 'testDir1';
    const CMD = `frodo idm export -AD ${dirName}`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
    fs.rmdirSync(dirName, {
      recursive: true,
    });
  });

  test('"frodo idm export -AD testDir2 -E test/e2e/env/testEntityFile.json -e test/e2e/env/testEnvFile.env": should export all idm config entities to separate files in the "testDir" directory according to the entity and env files', async () => {
    const dirName = 'testDir2';
    const CMD = `frodo idm export -AD ${dirName} -E test/e2e/env/testEntitiesFile.json -e test/e2e/env/testEnvFile.env`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
    //Delete test files
    fs.rmdirSync(dirName, {
      recursive: true,
    });
  });

  test('"frodo idm export --all-separate --directory testDir3 --entities-file test/e2e/env/testEntityFile.json --env-file test/e2e/env/testEnvFile.env": should export all idm config entities to separate files in the "testDir" directory according to the entity and env files', async () => {
    const dirName = 'testDir3';
    const CMD = `frodo idm export --all-separate --directory ${dirName} --entities-file test/e2e/env/testEntitiesFile.json --env-file test/e2e/env/testEnvFile.env`;
    await testExport(CMD, env, undefined, undefined, dirName, false);
    //Delete test files
    fs.rmdirSync(dirName, {
      recursive: true,
    });
  });
});
