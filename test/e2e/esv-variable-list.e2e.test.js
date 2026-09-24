/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list -l
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list -u
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list -lu
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list -uf test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list --usage --long --file test/e2e/exports/all/all.cloud.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list -uD test/e2e/exports/all-separate/cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo esv variable list --usage --long --directory test/e2e/exports/all-separate/cloud
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

describe('frodo esv variable list', () => {
    test('"frodo esv variable list": should list the ids of the esv variables', async () => {
        const CMD = `frodo esv variable list`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo esv variable list -l": should list the ids, values, statuses, descriptions, modifiers, and modified times of the esv variables', async () => {
        const CMD = `frodo esv variable list -l`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo esv variable list -u": should list the usage of the esv variables', async () => {
        const CMD = `frodo esv variable list -u`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });

    test('"frodo esv variable list -lu": should list the ids, values, statuses, descriptions, modifiers, usage, and modified times of the esv variables', async () => {
        const CMD = `frodo esv variable list -lu`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot();
    });

    test(`"frodo esv variable list -uf ${allConfigFile}": should list the usage of the esv variables in the ${allConfigFile} file`, async () => {
        const CMD = `frodo esv variable list -uf ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv variable list --usage --long --file ${allConfigFile}": should list the ids, values, statuses, descriptions, modifiers, usage, and modified times of the esv variables in the ${allConfigFile} file`, async () => {
        const CMD = `frodo esv variable list --usage --long --file ${allConfigFile}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv variable list -uD ${allConfigDirectory}": should list the usage of the esv variables in the ${allConfigDirectory} directory`, async () => {
        const CMD = `frodo esv variable list -uD ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test(`"frodo esv variable list --usage --long --directory ${allConfigDirectory}": should list the ids, values, statuses, descriptions, modifiers, usage, and modified times of the esv variables in the ${allConfigDirectory} directory`, async () => {
        const CMD = `frodo esv variable list --usage --long --directory ${allConfigDirectory}`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
