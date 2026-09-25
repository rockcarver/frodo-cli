/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export --agent-id frodo-test-web-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -i frodo-test-web-agent -f my-frodo-test-web-agent.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -Ni frodo-test-web-agent -D agentWebExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -a --file my-allAlphaAgents.web.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -NaD agentWebExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent web export --all-separate --no-metadata --directory agentWebExportTestDir3
*/
import { getEnv, testExport, stageFixture, clearFixture } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'web.agent';
// const stagingCommand = `frodo agent web import -i frodo-test-web-agent -f test/e2e/exports/all/allAlphaAgents.web.agent.json`;

describe('frodo agent web export', () => {
    // beforeEach(async () => {
    //     await stageFixture(stagingCommand, env);
    // });

    // afterEach(async () => {
    //     await clearFixture('frodo agent web delete -i frodo-test-web-agent', env);
    // });
    test('"frodo agent web export --agent-id frodo-test-web-agent": should export the web agent with agent id "frodo-test-web-agent"', async () => {
        const exportFile = "frodo-test-web-agent.web.agent.json";
        const CMD = `frodo agent web export --agent-id frodo-test-web-agent`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent web export -i frodo-test-web-agent -f my-frodo-test-web-agent.web.agent.json": should export the web agent with agent id "frodo-test-web-agent" into file named test.json', async () => {
        const exportFile = "my-frodo-test-web-agent.web.agent.json";
        const CMD = `frodo agent web export -i frodo-test-web-agent -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent web export -Ni frodo-test-web-agent -D agentWebExportTestDir1": should export the web agent with agent id "frodo-test-web-agent" into the directory agentWebExportTestDir1', async () => {
        const exportDirectory = "agentWebExportTestDir1";
        const CMD = `frodo agent web export -Ni frodo-test-web-agent -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent web export --all": should export all web agents to a single file', async () => {
        const exportFile = "allAlphaAgents.web.agent.json";
        const CMD = `frodo agent web export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent web export -NaD agentWebExportTestDir2": should export all web agents to a single file in the directory agentWebExportTestDir2', async () => {
        const exportDirectory = "agentWebExportTestDir2";
        const CMD = `frodo agent web export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent web export -A": should export all web agents to separate files', async () => {
        const CMD = `frodo agent web export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo agent web export --all-separate --no-metadata --directory agentWebExportTestDir3": should export all web agents to separate files in the directory agentWebExportTestDir3', async () => {
        const exportDirectory = "agentWebExportTestDir3";
        const CMD = `frodo agent web export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
