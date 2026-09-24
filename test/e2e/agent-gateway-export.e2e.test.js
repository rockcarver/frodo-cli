/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export --agent-id frodo-test-ig-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export -i frodo-test-ig-agent -f my-frodo-test-ig-agent.gateway.agent.json.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export -Ni frodo-test-ig-agent -D agentGatewayExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export -a --file my-allAlphaAgents.gateway.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export -NaD agentGatewayExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent gateway export --all-separate --no-metadata --directory agentGatewayExportTestDir3
*/
import { getEnv, testExport, stageFixture, clearFixture } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'gateway.agent';
// const stagingCommand = `frodo agent gateway import -i frodo-test-ig-agent -f test/e2e/exports/all/allAlphaAgents.gateway.agent.json`;

describe('frodo agent gateway export', () => {
    // beforeEach(async () => {
    //     await stageFixture(stagingCommand, env);
    // });

    // afterEach(async () => {
    //     await clearFixture('frodo agent gateway delete -i frodo-test-ig-agent', env);
    // });
    test('"frodo agent gateway export --agent-id frodo-test-ig-agent": should export the gateway agent with agent id "frodo-test-ig-agent"', async () => {
        const exportFile = "frodo-test-ig-agent.gateway.agent.json";
        const CMD = `frodo agent gateway export --agent-id frodo-test-ig-agent`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent gateway export -i frodo-test-ig-agent -f my-frodo-test-ig-agent.gateway.agent.json.json": should export the gateway agent with agent id "frodo-test-ig-agent" into file named my-frodo-test-ig-agent.gateway.agent.json', async () => {
        const exportFile = "my-frodo-test-ig-agent.gateway.agent.json.json";
        const CMD = `frodo agent gateway export -i frodo-test-ig-agent -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent gateway export -Ni frodo-test-ig-agent -D agentGatewayExportTestDir1": should export the gateway agent with agent id "frodo-test-ig-agent" into the directory named agentGatewayExportTestDir1', async () => {
        const exportDirectory = "agentGatewayExportTestDir1";
        const CMD = `frodo agent gateway export -Ni frodo-test-ig-agent -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent gateway export --all": should export all gateway agents to a single file', async () => {
        const exportFile = "allAlphaAgents.gateway.agent.json";
        const CMD = `frodo agent gateway export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent gateway export -a --file my-allAlphaAgents.gateway.agent.json": should export all gateway agents to a single file named my-allAlphaAgents.gateway.agent.json', async () => {
        const exportFile = "my-allAlphaAgents.gateway.agent.json";
        const CMD = `frodo agent gateway export -a --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent gateway export -NaD agentGatewayExportTestDir2": should export all gateway agents to a single file in the directory agentGatewayExportTestDir2', async () => {
        const exportDirectory = "agentGatewayExportTestDir2";
        const CMD = `frodo agent gateway export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent gateway export -A": should export all gateway agents to separate files', async () => {
        const CMD = `frodo agent gateway export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo agent gateway export --all-separate --no-metadata --directory agentGatewayExportTestDir3": should export all gateway agents to separate files in the directory agentGatewayExportTestDir3', async () => {
        const exportDirectory = "agentGatewayExportTestDir3";
        const CMD = `frodo agent gateway export --all-separate --no-metadata --directory agentGatewayExportTestDir3`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
