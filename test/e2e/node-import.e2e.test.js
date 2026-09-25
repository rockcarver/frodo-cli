/** See test/e2e/README.md for how to write and record e2e tests. */

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
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allDirectory = "test/e2e/exports/all";
const allNodesFileName = "allCustomNodes.nodeTypes.json";
const allNodesExport = `${allDirectory}/${allNodesFileName}`;
const allSeparateNodesDirectory = `test/e2e/exports/all-separate/cloud/global/nodeTypes`;

describe('frodo node import', () => {
  test(`"frodo node import -i c605506774a848f7877b4d17a453bd39 -f ${allNodesExport}": should import the custom node with the service name "c605506774a848f7877b4d17a453bd39" from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import -i c605506774a848f7877b4d17a453bd39 -f ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import --node-id c605506774a848f7877b4d17a453bd39-1 --file ${allNodesFileName} --directory ${allDirectory}": should import the custom node with the id "c605506774a848f7877b4d17a453bd39-1" from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import --node-id c605506774a848f7877b4d17a453bd39-1 --file ${allNodesFileName} --directory ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import -n 'Display Callback' -f ${allNodesFileName} -D ${allDirectory}": should import the custom node named "Display Callback" from the file ${allNodesExport}`, async () => {
    const CMD = `frodo node import -n 'Display Callback' -f ${allNodesFileName} -D ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import --node-name 'Display Callback' --file ${allNodesExport}": should import the custom node named "Display Callback" from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import --node-name 'Display Callback' --file ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import -f ${allNodesExport}": should import the first custom node from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import -f ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import -af ${allNodesFileName} -D ${allDirectory}": should import all custom nodes from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import -af ${allNodesFileName} -D ${allDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import --all --file ${allNodesExport}": should import all custom nodes from the file "${allNodesExport}"`, async () => {
    const CMD = `frodo node import --all --file ${allNodesExport}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import -AD ${allSeparateNodesDirectory}": should import all custom nodes from the ${allSeparateNodesDirectory} directory"`, async () => {
    const CMD = `frodo node import -AD ${allSeparateNodesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });

  test(`"frodo node import --all-separate --directory ${allSeparateNodesDirectory}": should import all custom nodes from the ${allSeparateNodesDirectory} directory"`, async () => {
    const CMD = `frodo node import --all-separate --directory ${allSeparateNodesDirectory}`;
    const { stdout } = await exec(CMD, env);
    expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
  });
});
