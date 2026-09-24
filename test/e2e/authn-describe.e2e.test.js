/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn describe
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo authn describe --json
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo authn describe -gm classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo authn describe --global --json --type classic
*/
import { getEnv, normalizeSnapshotText } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';
import { promisify } from "util";
import cp from "child_process";

const exec = promisify(cp.exec);

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo authn describe', () => {
    test('"frodo authn describe": should describe authentication settings', async () => {
        const CMD = `frodo authn describe`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authn describe --json": should describe authentication settings in json format', async () => {
        const CMD = `frodo authn describe --json`;
        const { stdout } = await exec(CMD, env);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authn describe -gm classic": should describe global authentication settings', async () => {
        const CMD = `frodo authn describe -gm classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });

    test('"frodo authn describe --global --json --type classic": should describe global authentication settings in json format', async () => {
        const CMD = `frodo authn describe --global --json --type classic`;
        const { stdout } = await exec(CMD, classicEnv);
        expect(normalizeSnapshotText(stdout)).toMatchSnapshot()
    });
});
