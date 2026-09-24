/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script describe -i 1b52a7e0-4019-40fa-958a-15a49870e901
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script describe -un shared
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script describe -un shared -f test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script describe -un shared -D test/e2e/exports/all-separate/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script describe --json --usage --script-id 1b52a7e0-4019-40fa-958a-15a49870e901 --file test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo script describe --json --usage --script-name shared --directory test/e2e/exports/all-separate/cloud
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

describe('frodo script describe', () => {
    test(`"frodo script describe -i 1b52a7e0-4019-40fa-958a-15a49870e901": should describe the script with id "1b52a7e0-4019-40fa-958a-15a49870e901"`, async () => {
        const CMD = `frodo script describe -i 1b52a7e0-4019-40fa-958a-15a49870e901`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo script describe -un shared": should describe the script with name "shared" with usage`, async () => {
        const CMD = `frodo script describe -un shared`;
        let stdout = '';
        let stderr = '';
        try {
            const result = await exec(CMD, env);
            stdout = result.stdout ?? '';
            stderr = result.stderr ?? '';
        } catch (e) {
            stdout = e?.stdout ?? '';
            stderr = e?.stderr ?? '';
        }
        expect(normalizeSnapshotText(stderr)).toMatchSnapshot();
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });

    test(`"frodo script describe -un shared -f ${allConfigFile}": should describe the script with name "shared" with usage from file ${allConfigFile}`, async () => {
        const CMD = `frodo script describe -un shared -f ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo script describe -un shared -D ${allConfigDirectory}": should describe the script with name "shared" with usage from directory ${allConfigDirectory}`, async () => {
        const CMD = `frodo script describe -un shared -D ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo script describe --json --usage --script-id 1b52a7e0-4019-40fa-958a-15a49870e901 --file ${allConfigFile}": should describe the script with id "1b52a7e0-4019-40fa-958a-15a49870e901" with usage from file ${allConfigFile} and json output`, async () => {
        const CMD = `frodo script describe --json --usage --script-id 1b52a7e0-4019-40fa-958a-15a49870e901 --file ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo script describe --json --usage --script-name shared --directory ${allConfigDirectory}": should describe the script with name "shared" with usage from directory ${allConfigDirectory} and json output`, async () => {
        const CMD = `frodo script describe --json --usage --script-name shared --directory ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
