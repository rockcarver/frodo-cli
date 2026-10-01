/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete cors -n test 
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete cors -y
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete cors -d
*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager delete cors', () => {
    test('"frodo config-manager delete cors -y": should delete all CORS secondary configurations in fr-config manager style.', async () => {
        const CMD = `frodo config-manager delete cors -y`;
        await testSuccess(CMD, env);
    });

    test('"frodo config-manager delete cors -n test": should delete CORS secondary configuration by name custom in fr-config manager style.', async () => {
        const CMD = `frodo config-manager delete cors -n test`;
        await testSuccess(CMD, env);
    });

    test('"frodo config-manager delete cors -d": should give a dry run showing which CORS would be deleted without deleting. Shown in fr-config manager style.', async () => {
        const CMD = `frodo config-manager delete cors -d`;
        await testSuccess(CMD, env);
    });
});