/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type describe -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type describe --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type describe -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type describe -n URL
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type describe --type-name URL
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authz type describe -n URL --json
 */
import cp from 'child_process';
import { promisify } from 'util';
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

describe('frodo authz type describe', () => {
    test('"frodo authz type describe -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2": should describe the 76656a38-5f8e-401b-83aa-4ccb74ce88d2 resource type', async () => {
        const CMD = `frodo authz type describe -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz type describe --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2": should describe the 76656a38-5f8e-401b-83aa-4ccb74ce88d2 resource type', async () => {
        const CMD = `frodo authz type describe --type-id 76656a38-5f8e-401b-83aa-4ccb74ce88d2`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz type describe -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --json": should describe the 76656a38-5f8e-401b-83aa-4ccb74ce88d2 resource type in json', async () => {
        const CMD = `frodo authz type describe -i 76656a38-5f8e-401b-83aa-4ccb74ce88d2 --json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz type describe -n URL": should describe the URL resource type', async () => {
        const CMD = `frodo authz type describe -n URL`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz type describe --type-name URL": should describe the URL resource type', async () => {
        const CMD = `frodo authz type describe --type-name URL`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authz type describe -n URL --json": should describe the URL resource type in json', async () => {
        const CMD = `frodo authz type describe -n URL --json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
