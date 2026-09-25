/** See test/e2e/README.md for how to write and record e2e tests. */

/*
// Cloud
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore list
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo secretstore list -l

// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore list -gm classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo secretstore list --long --global --type classic
*/

import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c, classic_connection as cc } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

describe('frodo secretstore list', () => {
    test('"frodo secretstore list": should list the secret stores in current realm', async () => {
        const CMD = `frodo secretstore list`;
        await testSuccess(CMD, env);
    });
    test('"frodo secretstore list -l": should list the secret stores in current realm with more detail', async () => {
        const CMD = `frodo secretstore list -l`;
        await testSuccess(CMD, env);
    });
    test('"frodo secretstore list -gm classic": should list global secret stores', async () => {
        const CMD = `frodo secretstore list -gm classic`;
        await testSuccess(CMD, classicEnv);
    });
    test('"frodo secretstore list --long --global --type classic": should list global secret stores with more detail', async () => {
        const CMD = `frodo secretstore list --long --global --type classic`;
        await testSuccess(CMD, classicEnv);
    });
});
