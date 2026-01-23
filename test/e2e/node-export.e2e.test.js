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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -Nxi c605506774a848f7877b4d17a453bd39 -D customNodeExportDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --node-id c605506774a848f7877b4d17a453bd39-1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -xn 'Display Callback' -D customNodeExportDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --node-name 'Display Callback' --use-string-arrays
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --all --no-metadata --file customNodeTest1.json --directory customNodeExportDir3 --use-string-arrays
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -AND customNodeExportDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --all-separate --extract --directory customNodeExportDir5 --use-string-arrays
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'nodeTypes';

describe('frodo node export', () => {
  test('"frodo node export -Nxi c605506774a848f7877b4d17a453bd39 -D customNodeExportDir1": should export custom node with service name "c605506774a848f7877b4d17a453bd39" to directory customNodeExportDir1 with no metadata and extracted script', async () => {
    const exportFile = "c605506774a848f7877b4d17a453bd39.nodeTypes.json";
    const exportDirectory = "customNodeExportDir1";
    const CMD = `frodo node export -Nxi c605506774a848f7877b4d17a453bd39 -D ${exportDirectory}`;
    await testExport(CMD, env, type, exportFile, exportDirectory, false);
  });

  test('"frodo node export --node-id c605506774a848f7877b4d17a453bd39-1": should export the custom node with id "c605506774a848f7877b4d17a453bd39-1"', async () => {
    const exportFile = 'c605506774a848f7877b4d17a453bd39-1.nodeTypes.json';
    const CMD = `frodo node export --node-id c605506774a848f7877b4d17a453bd39-1`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo node export -xn \'Display Callback\' -D customNodeExportDir2": should export the custom node with display name "Display Callback" to the directory customNodeExportDir2 with extracted script', async () => {
    const exportFile = "Display-Callback.nodeTypes.json";
    const exportDirectory = 'customNodeExportDir2';
    const CMD = `frodo node export -xn 'Display Callback' -D ${exportDirectory}`;
    await testExport(CMD, env, type, exportFile, exportDirectory);
  });

  test('"frodo node export --node-name \'Display Callback\' --use-string-arrays": should export the custom node with display name "DisplayCallback"', async () => {
    const exportFile = 'Display-Callback.nodeTypes.json';
    const CMD = `frodo node export --node-name 'Display Callback' --use-string-arrays`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo node export -a": should export all custom nodes to a single file', async () => {
    const exportFile = 'allCustomNodes.nodeTypes.json';
    const CMD = `frodo node export -a`;
    await testExport(CMD, env, type, exportFile);
  });

  test('"frodo node export --all --no-metadata --file customNodeTest1.json --directory customNodeExportDir3 --use-string-arrays": should export all nodes to a single file named customNodeTest1.json in the directory customNodeExportDir3 with no metadata', async () => {
    const exportFile = 'customNodeTest1.json';
    const exportDirectory = 'customNodeExportDir3';
    const CMD = `frodo node export --all --no-metadata --file ${exportFile} --directory ${exportDirectory} --use-string-arrays`;
    await testExport(CMD, env, type, exportFile, exportDirectory, false);
  });

  test('"frodo node export -AND customNodeExportDir4": should export all nodes into separate files with no metadata in the directory customNodeExportDir4', async () => {
    const exportDirectory = 'customNodeExportDir4';
    const CMD = `frodo node export -AND ${exportDirectory}`;
    await testExport(CMD, env, type, undefined, exportDirectory, false);
  });

  test('"frodo node export --all-separate --extract --directory customNodeExportDir5 --use-string-arrays": should export all nodes with extracted scripts into separate files in the directory customNodeExportDir5', async () => {
    const exportDirectory = 'customNodeExportDir5';
    const CMD = `frodo node export --all-separate --extract --directory ${exportDirectory} --use-string-arrays`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });
});
