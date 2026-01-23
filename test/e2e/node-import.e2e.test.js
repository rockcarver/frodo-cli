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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import -i c605506774a848f7877b4d17a453bd39 -f test/e2e/exports/all/allCustomNodes.nodeTypes.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import --node-id c605506774a848f7877b4d17a453bd39-1 --file allCustomNodes.nodeTypes.json --directory test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import -n 'Display Callback' -f allCustomNodes.nodeTypes.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import --node-name 'Display Callback' --file test/e2e/exports/all/allCustomNodes.nodeTypes.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import -f test/e2e/exports/all/allCustomNodes.nodeTypes.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import -af allCustomNodes.nodeTypes.json -D test/e2e/exports/all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import --all --file test/e2e/exports/all/allCustomNodes.nodeTypes.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import -AD test/e2e/exports/all-separate/cloud/global/nodeTypes
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo node import --all-separate --directory test/e2e/exports/all-separate/cloud/global/nodeTypes
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, removeAnsiEscapeCodes } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allNodesFileName = "allCustomNodes.nodeTypes.json";
const allNodesExport = `${allDirectory}/${allNodesFileName}`;
const allSeparateNodesDirectory = `test/e2e/exports/all-separate/cloud/global/nodeTypes`;

describe('frodo node import', () => {
  test(`"frodo node import -i c605506774a848f7877b4d17a453bd39 -f ${allNodesExport}": should import the custom node with the service name "c605506774a848f7877b4d17a453bd39" from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import -i c605506774a848f7877b4d17a453bd39 -f ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import --node-id c605506774a848f7877b4d17a453bd39-1 --file ${allNodesFileName} --directory ${allDirectory}": should import the custom node with the id "c605506774a848f7877b4d17a453bd39-1" from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import --node-id c605506774a848f7877b4d17a453bd39-1 --file ${allNodesFileName} --directory ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import -n 'Display Callback' -f ${allNodesFileName} -D ${allDirectory}": should import the custom node named "Display Callback" from the file ${allNodesExport}`, async () => {
    const CMD = `frodo node import -n 'Display Callback' -f ${allNodesFileName} -D ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import --node-name 'Display Callback' --file ${allNodesExport}": should import the custom node named "Display Callback" from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import --node-name 'Display Callback' --file ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import -f ${allNodesExport}": should import the first custom node from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import -f ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import -af ${allNodesFileName} -D ${allDirectory}": should import all custom nodes from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import -af ${allNodesFileName} -D ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import --all --file ${allNodesExport}": should import all custom nodes from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import --all --file ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import -AD ${allSeparateNodesDirectory}": should import all custom nodes from the ${allSeparateNodesDirectory} directory"`, async () => {
    const CMD = `frodo node import -AD ${allSeparateNodesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });

  test(`"frodo node import --all-separate --directory ${allSeparateNodesDirectory}": should import all custom nodes from the ${allSeparateNodesDirectory} directory"`, async () => {
    const CMD = `frodo node import --all-separate --directory ${allSeparateNodesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(removeAnsiEscapeCodes(stdout)).toMatchSnapshot();
  });
});
