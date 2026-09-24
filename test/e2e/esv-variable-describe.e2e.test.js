/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -i esv-neo-age
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -ui esv-test-var-pi
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -ui esv-test-var-pi -f test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe -ui esv-test-var-pi -D test/e2e/exports/all-separate/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe --json --usage --variable-id esv-test-var-pi --file test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable describe --json --usage --variable-id esv-test-var-pi --directory test/e2e/exports/all-separate/cloud
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const allConfigFile = 'test/e2e/exports/all/all.cloud.json';
const allConfigDirectory = 'test/e2e/exports/all-separate/cloud';

describe('frodo esv variable describe', () => {
    test(`"frodo esv variable describe -i esv-neo-age": should describe the esv variable "esv-neo-age"`, async () => {
        const CMD = `frodo esv variable describe -i esv-neo-age`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv variable describe -ui esv-test-var-pi": should describe the esv variable "esv-test-var-pi" with usage`, async () => {
        const CMD = `frodo esv variable describe -ui esv-test-var-pi`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });

    test(`"frodo esv variable describe -ui esv-test-var-pi -f ${allConfigFile}": should describe the esv variable "esv-test-var-pi" with usage from file ${allConfigFile}`, async () => {
        const CMD = `frodo esv variable describe -ui esv-test-var-pi -f ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv variable describe -ui esv-test-var-pi -D ${allConfigDirectory}": should describe the esv variable "esv-test-var-pi" with usage from directory ${allConfigDirectory}`, async () => {
        const CMD = `frodo esv variable describe -ui esv-test-var-pi -D ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv variable describe --json --usage --variable-id esv-test-var-pi --file ${allConfigFile}": should describe the esv variable "esv-test-var-pi" with usage from file ${allConfigFile} and json output`, async () => {
        const CMD = `frodo esv variable describe --json --usage --variable-id esv-test-var-pi --file ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv variable describe --json --usage --variable-id esv-test-var-pi --directory ${allConfigDirectory}": should describe the esv variable "esv-test-var-pi" with usage from directory ${allConfigDirectory} and json output`, async () => {
        const CMD = `frodo esv variable describe --json --usage --variable-id esv-test-var-pi --directory ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
