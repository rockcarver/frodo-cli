/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy describe -i "Test Policy"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy describe --policy-id "Test Policy"
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy describe -i "Test Policy" --json
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo authz policy describe', () => {
    test('"frodo authz policy describe -i "Test Policy"": should describe the "Test Policy" policy', async () => {
        const CMD = `frodo authz policy describe -i "Test Policy"`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy describe --policy-id "Test Policy"": should describe the "Test Policy" policy', async () => {
        const CMD = `frodo authz policy describe --policy-id "Test Policy"`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy describe -i "Test Policy" --json": should describe the "Test Policy" policy in json', async () => {
        const CMD = `frodo authz policy describe -i "Test Policy" --json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
