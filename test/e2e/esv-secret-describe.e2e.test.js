/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret describe -i esv-test-secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret describe -ui esv-test-secret
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret describe -ui esv-test-secret -f test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret describe -ui esv-test-secret -D test/e2e/exports/all-separate/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret describe --json --usage --secret-id esv-test-secret --file test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv secret describe --json --usage --secret-id esv-test-secret --directory test/e2e/exports/all-separate/cloud
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

describe('frodo esv secret describe', () => {
    test(`"frodo esv secret describe -i esv-test-secret": should describe the esv secret "esv-test-secret"`, async () => {
        const CMD = `frodo esv secret describe -i esv-test-secret`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv secret describe -ui esv-test-secret": should describe the esv secret "esv-test-secret" with usage`, async () => {
        const CMD = `frodo esv secret describe -ui esv-test-secret`;
        try {
            await exec(CMD, env);
            fail("Command should've failed")
        } catch (e) {
            expect(normalizeSnapshotText(e.stderr)).toMatchSnapshot();
            expect(normalizeSnapshotText(e.stdout)).toMatchSnapshot();
        }
    });

    test(`"frodo esv secret describe -ui esv-test-secret -f ${allConfigFile}": should describe the esv secret "esv-test-secret" with usage from file ${allConfigFile}`, async () => {
        const CMD = `frodo esv secret describe -ui esv-test-secret -f ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv secret describe -ui esv-test-secret -D ${allConfigDirectory}": should describe the esv secret "esv-test-secret" with usage from directory ${allConfigDirectory}`, async () => {
        const CMD = `frodo esv secret describe -ui esv-test-secret -D ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv secret describe --json --usage --secret-id esv-test-secret --file ${allConfigFile}": should describe the esv secret "esv-test-secret" with usage from file ${allConfigFile} and json output`, async () => {
        const CMD = `frodo esv secret describe --json --usage --secret-id esv-test-secret --file ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv secret describe --json --usage --secret-id esv-test-secret --directory ${allConfigDirectory}": should describe the esv secret "esv-test-secret" with usage from directory ${allConfigDirectory} and json output`, async () => {
        const CMD = `frodo esv secret describe --json --usage --secret-id esv-test-secret --directory ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
