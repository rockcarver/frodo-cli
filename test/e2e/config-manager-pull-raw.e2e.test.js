/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am FRODO_TEST_NAME=0_D_f frodo config-manager pull raw -D configManagerExportRawDir0 -f test/e2e/fr-config-manager-pull-config/raw.json
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

const configFile = 'test/e2e/fr-config-manager-pull-config/raw.json';

// Each FRODO_TEST_NAME is the recording's identity (the args id frodo-lib derives from the command): a changed flag does not move the recording.
describe('frodo config-manager pull raw', () => {
    test('"frodo config-manager pull raw -D configManagerExportRawDir0 -f test/e2e/fr-config-manager-pull-config/raw.json": should export all the configs in the provided json file in fr-config manager style.', async () => {
        const dirName = 'configManagerExportRawDir0';
        const CMD = `frodo config-manager pull raw -D ${dirName} -f ${configFile}`;
        await testExport(CMD, { ...env, env: { ...env.env, FRODO_TEST_NAME: '0_D_f' } }, undefined, undefined, dirName, false);
    });
});