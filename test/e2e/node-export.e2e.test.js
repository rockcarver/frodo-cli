/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -Nxi c605506774a848f7877b4d17a453bd39 -D customNodeExportDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --node-id c605506774a848f7877b4d17a453bd39-1 -D customNodeExportDir6
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -xn 'Display Callback' -D customNodeExportDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --node-name 'Display Callback' --use-string-arrays --no-extract
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -a
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --all --no-metadata --file customNodeTest1.json --directory customNodeExportDir3 --use-string-arrays
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export -AND customNodeExportDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node export --all-separate --no-extract --directory customNodeExportDir5 --use-string-arrays
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'nodeTypes';

describe('frodo node export', () => {
  test('"frodo node export -Nxi c605506774a848f7877b4d17a453bd39 -D customNodeExportDir1": should export custom node with service name "c605506774a848f7877b4d17a453bd39" to directory customNodeExportDir1 with no metadata and extracted script', async () => {
    const exportFile = "c605506774a848f7877b4d17a453bd39.nodeTypes.json";
    const exportDirectory = "customNodeExportDir1";
    const CMD = `frodo node export -Nxi c605506774a848f7877b4d17a453bd39 -D ${exportDirectory}`;
    await testExport(CMD, env, type, exportFile, exportDirectory, false);
  });

  test('"frodo node export --node-id c605506774a848f7877b4d17a453bd39-1 -D customNodeExportDir6": should export the custom node with id "c605506774a848f7877b4d17a453bd39-1"', async () => {
    const exportFile = 'c605506774a848f7877b4d17a453bd39-1.nodeTypes.json';
    const exportDirectory = 'customNodeExportDir6'
    const CMD = `frodo node export --node-id c605506774a848f7877b4d17a453bd39-1 -D ${exportDirectory}`;
    await testExport(CMD, env, type, exportFile, exportDirectory);
  });

  test('"frodo node export -xn \'Display Callback\' -D customNodeExportDir2": should export the custom node with display name "Display Callback" to the directory customNodeExportDir2 with extracted script', async () => {
    const exportFile = "Display-Callback.nodeTypes.json";
    const exportDirectory = 'customNodeExportDir2';
    const CMD = `frodo node export -xn 'Display Callback' -D ${exportDirectory}`;
    await testExport(CMD, env, type, exportFile, exportDirectory);
  });

  test('"frodo node export --node-name \'Display Callback\' --use-string-arrays --no-extract": should export the custom node with display name "DisplayCallback"', async () => {
    const exportFile = 'Display-Callback.nodeTypes.json';
    const CMD = `frodo node export --node-name 'Display Callback' --use-string-arrays --no-extract`;
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

  test('"frodo node export --all-separate --no-extract --directory customNodeExportDir5 --use-string-arrays": should export all nodes into separate files in the directory customNodeExportDir5', async () => {
    const exportDirectory = 'customNodeExportDir5';
    const CMD = `frodo node export --all-separate --no-extract --directory ${exportDirectory} --use-string-arrays`;
    await testExport(CMD, env, type, undefined, exportDirectory);
  });
});
