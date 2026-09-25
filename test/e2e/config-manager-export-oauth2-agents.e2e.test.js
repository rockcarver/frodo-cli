/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir0
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir1 -r alpha
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir3 -n frodo-test-java-agent -r alpha
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo config-manager pull oauth2-agents --directory configManagerExportOauth2AgentsDir5 -f test/e2e/fr-config-manager-pull-config/oauth2-agents.json

*/

import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const configFile = 'test/e2e/fr-config-manager-pull-config/oauth2-agents.json';


describe('frodo config-manager pull oauth2-agents', () => {
    test('"frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir0": should export all agents from all realms in fr-config manager style.', async () => {
        const dirName = 'configManagerExportOauth2AgentsDir0';
        const CMD = `frodo config-manager pull oauth2-agents -D ${dirName}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir1 -r alpha": should export all agents in the alpha realm in fr-config manager style.', async () => {
        const dirName = 'configManagerExportOauth2AgentsDir1';
        const realm = 'alpha';
        const CMD = `frodo config-manager pull oauth2-agents -D ${dirName} -r ${realm}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test('"frodo config-manager pull oauth2-agents -D configManagerExportOauth2AgentsDir3 -n frodo-test-java-agent -r alpha": should export only the agent with the id: "frodo-test-java-agent".', async () => {
        const dirName = 'configManagerExportOauth2AgentsDir3';
        const agentName = 'frodo-test-java-agent';
        const realm = 'alpha';
        const CMD = `frodo config-manager pull oauth2-agents -D ${dirName} -n ${agentName} -r ${realm}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
    test(`"frodo config-manager pull oauth2-agents --directory configManagerExportOauth2AgentsDir5 -f ${configFile}": should export all the agents defined in the config file.`, async () => {
        const dirName = 'configManagerExportOauth2AgentsDir5';
        const CMD = `frodo config-manager pull oauth2-agents --directory ${dirName} -f ${configFile}`;
        await testExport(CMD, env, undefined, undefined, dirName, false);
    });
});