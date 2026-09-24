/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull connector-definitions -D configManagerExportConnectorDefinitionsDir0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull connector-definitions -D configManagerExportConnectorDefinitionsDir1 -n Azure

*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);

describe('frodo config-manager pull connector-definitions', () => {
    test('"frodo config-manager pull connector-definitions -D configManagerExportConnectorDefinitionsDir0": should export all connector definitions in fr-config manager style.', async () => {
        const dirName = 'configManagerExportConnectorDefinitionsDir0';
        const CMD = `frodo config-manager pull connector-definitions -D ${dirName}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull connector-definitions -D configManagerExportConnectorDefinitionsDir1 -n Azure": should export only the Azure connector definition in fr-config manager style.', async () => {    
        const dirName = 'configManagerExportConnectorDefinitionsDir1';
        const connectorName = 'Azure';
        const CMD = `frodo config-manager pull connector-definitions -D ${dirName} -n ${connectorName}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});