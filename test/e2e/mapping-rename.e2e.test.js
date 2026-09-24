/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping rename -i sync/managedAlpha_application_managedBravo_application
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping rename --legacy --mapping-id mapping/managedBravo_group_managedBravo_group
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping rename --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo mapping rename -al
*/
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo mapping rename', () => {
    test(`"frodo mapping rename -i sync/managedAlpha_application_managedBravo_application": should rename the mapping with id sync/managedAlpha_application_managedBravo_application to new"`, async () => {
        const CMD = `frodo mapping rename -i sync/managedAlpha_application_managedBravo_application`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping rename --legacy --mapping-id mapping/managedBravo_group_managedBravo_group": should rename the mapping with id mapping/managedBravo_group_managedBravo_group to legacy"`, async () => {
        const CMD = `frodo mapping rename --legacy --mapping-id mapping/managedBravo_group_managedBravo_group`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping rename --all": should rename all mappings to new"`, async () => {
        const CMD = `frodo mapping rename --all`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo mapping rename -al": should rename all mappings to legacy"`, async () => {
        const CMD = `frodo mapping rename -al`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
