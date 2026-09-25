/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy list -l
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy list --long

FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy list --set-id test-policy-set
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy list -l --set-id test-policy-set
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz policy list --long --set-id test-policy-set
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo authz policy list', () => {
    test('"frodo authz policy list": should list the ids of the authz policies', async () => {
        const CMD = `frodo authz policy list`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy list -l": should list the ids, descriptions, and statuses of the authz policies', async () => {
        const CMD = `frodo authz policy list -l`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy list --long": should list the ids, descriptions, and statuses of the authz policies', async () => {
        const CMD = `frodo authz policy list --long`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy list --set-id test-policy-set": should list the ids of the authz policies in the test-policy-set set', async () => {
        const CMD = `frodo authz policy list --set-id test-policy-set`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy list -l --set-id test-policy-set": should list the ids, descriptions, and statuses of the authz policies in the test-policy-set set', async () => {
        const CMD = `frodo authz policy list -l --set-id test-policy-set`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz policy list --long --set-id test-policy-set": should list the ids, descriptions, and statuses of the authz policies in the test-policy-set set', async () => {
        const CMD = `frodo authz policy list --long --set-id test-policy-set`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
