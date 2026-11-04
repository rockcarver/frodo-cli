/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull csp -D configManagerExportCspDir0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull csp --directory configManagerExportCspDir1 -f test/e2e/fr-config-manager-pull-config/csp-overrides.json;

*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

const configFile = 'test/e2e/fr-config-manager-pull-config/csp-overrides.json';

describe('frodo config-manager pull csp', () => {
    test('"frodo config-manager pull csp -D configManagerExportCspDir0": should export the content security policy in fr-config manager style.', async () => {
        const dirName = 'configManagerExportCspDir0';
        const CMD = `frodo config-manager pull csp -D ${dirName}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull csp --directory configManagerExportCspDir1 -f ${configFile}": should export the content security policy with overrides defined in the config file.`, async () => {
        const dirName = 'configManagerExportCspDir1';
        const CMD = `frodo config-manager pull csp --directory ${dirName} -f ${configFile}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});