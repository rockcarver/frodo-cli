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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -a -D testDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -a -D testDir2 -f test.file.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -a -f test.file.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -A -D testDir3
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -i alpha_user 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -i bravo_assignment -f test2.file.json 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -i alpha_role -f test2.file.json -D testDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo idm schema object export -i alpha_group -D testDir5
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'idm';

describe('frodo idm schema object export', () => {
  test('"frodo idm schema object export -a": should export all managed objects into a single file', async () => {
    const CMD = `frodo idm schema object export -a`;
    await testExport(CMD, env, type, undefined, undefined, false);
  });

  test('"frodo idm schema object export -a -D testDir1": should export all managed objects into a single file in testDir1', async () => {
    const dirName = 'testDir1';
    const CMD = `frodo idm schema object export -a -D ${dirName}`;
    await testExport(CMD, env, type, undefined, dirName, false);
  });

  test('"frodo idm schema object export -a -D testDir2 -f test.file.json": should export all managed objects into a single file named test.file.json in testDir2', async () => {
    const dirName = 'testDir2';
    const fileName = 'test.file.json';
    const CMD = `frodo idm schema object export -a -D ${dirName} -f ${fileName}`;
    await testExport(CMD, env, type, fileName, dirName, false);
  });

  test('"frodo idm schema object export -a -f test.file.json": should export all managed objects into a single file named test.file.json', async () => {
    const fileName = 'test.file.json';
    const CMD = `frodo idm schema object export -a -f ${fileName}`;
    await testExport(CMD, env, type, fileName, undefined, false);
  });

  test('"frodo idm schema object export -A": should export all managed objects into separate files in the default directory "managed"', async () => {
    const defaultDirName = 'managed';
    const CMD = `frodo idm schema object export -A`;
    await testExport(CMD, env, type, undefined, defaultDirName, false);
  });

  test('"frodo idm schema object export -A -D testDir3": should export all managed objects into separate files in the directory "testDir3"', async () => {
    const dirName = 'testDir3';
    const CMD = `frodo idm schema object export -A -D ${dirName}`;
    await testExport(CMD, env, type, undefined, dirName, false);
  });

  test('"frodo idm schema object export -i alpha_user": should export the alpha_user managed object into a file named "alpha_user.managed.json"', async () => {
    const defaultFileName = 'alpha_user.managed.json';
    const CMD = `frodo idm schema object export -i alpha_user`;
    await testExport(CMD, env, type, defaultFileName, undefined, false);
  });

  test('"frodo idm schema object export -i bravo_assignment -f test2.file.json": should export the bravo_assignment managed object into a file named "test2.file.json"', async () => {
    const fileName = 'test2.file.json';
    const CMD = `frodo idm schema object export -i bravo_assignment -f ${fileName}`;
    await testExport(CMD, env, type, fileName, undefined, false);
  });

  test('"frodo idm schema object export -i alpha_role -f test2.file.json -D testDir4": should export the alpha_role managed object into a file named "test2.file.json" in the directory "testDir4"', async () => {
    const dirName = 'testDir4';
    const fileName = 'test2.file.json';
    const CMD = `frodo idm schema object export -i alpha_role -f ${fileName} -D ${dirName}`;
    await testExport(CMD, env, type, fileName, dirName, false);
  });

  test('"frodo idm schema object export -i alpha_group -D testDir5": should export the alpha_group managed object into a file named "alpha_group.managed.json" in the directory "testDir5"', async () => {
    const defaultFileName = 'alpha_group.managed.json';
    const dirName = 'testDir5';
    const CMD = `frodo idm schema object export -i alpha_group -D ${dirName}`;
    await testExport(CMD, env, type, defaultFileName, dirName, false);
  });
});
