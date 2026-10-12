/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete connector-mappings -y
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete connector-mappings -n test_mapping
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager delete connector-mappings -d

*/
import { getEnv, testSuccess } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager delete connector mappings', () => {
    test('"frodo config-manager delete connector-mappings -y": should delete all connector mappings in fr-config manager style.', async () => {
        const CMD = `frodo config-manager delete connector-mappings -y`;
        await testSuccess(CMD, env);
    });
    test('"frodo config-manager delete connector-mappings -n test_mapping": should delete the named connector mapping in fr-config manager style.', async () => {
        const CMD = `frodo config-manager delete connector-mappings -n test_mapping`;
        await testSuccess(CMD, env);
    });
    test('"frodo config-manager delete connector-mappings -d": should show the connector mappings that are able to be deleted in fr-config manager style.', async () => {
        const CMD = `frodo config-manager delete connector-mappings -d`;
        await testSuccess(CMD, env);
    });
});