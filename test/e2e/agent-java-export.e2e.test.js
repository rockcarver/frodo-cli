/** See test/e2e/README.md for how to write and record e2e tests. */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export --agent-id frodo-test-java-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -i frodo-test-java-agent -f my-frodo-test-java-agent.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -Ni frodo-test-java-agent -D agentJavaExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -a --file my-allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -NaD agentJavaExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export --all-separate --no-metadata --directory agentJavaExportTestDir3
*/
import { getEnv, testExport, stageFixture, clearFixture } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] ||= '1';
const env = getEnv(c);

const type = 'java.agent';
// const stagingCommand = `frodo agent java import -i frodo-test-java-agent -f test/e2e/exports/all/allAlphaAgents.java.agent.json`;

describe('frodo agent java export', () => {
    // beforeEach(async () => {
    //     await stageFixture(stagingCommand, env);
    // });

    // afterEach(async () => {
    //     await clearFixture('frodo agent java delete -i frodo-test-java-agent', env);
    // });
    test('"frodo agent java export --agent-id frodo-test-java-agent": should export the java agent with agent id "frodo-test-java-agent"', async () => {
        const exportFile = "frodo-test-java-agent.java.agent.json";
        const CMD = `frodo agent java export --agent-id frodo-test-java-agent`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent java export -i frodo-test-java-agent -f my-frodo-test-java-agent.java.agent.json": should export the java agent with agent id "frodo-test-java-agent" into file named my-frodo-test-java-agent.java.agent.json', async () => {
        const exportFile = "my-frodo-test-java-agent.java.agent.json";
        const CMD = `frodo agent java export -i frodo-test-java-agent -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent java export -Ni frodo-test-java-agent -D agentJavaExportTestDir1": should export the java agent with agent id "frodo-test-java-agent" into the directory agentJavaExportTestDir1', async () => {
        const exportDirectory = "agentJavaExportTestDir1";
        const CMD = `frodo agent java export -Ni frodo-test-java-agent -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent java export --all": should export all java agents to a single file', async () => {
        const exportFile = "allAlphaAgents.java.agent.json";
        const CMD = `frodo agent java export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent java export -a --file my-allAlphaAgents.java.agent.json": should export all java agents to a single file named my-allAlphaAgents.java.agent.json', async () => {
        const exportFile = "my-allAlphaAgents.java.agent.json";
        const CMD = `frodo agent java export -a --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent java export -NaD agentJavaExportTestDir2": should export all java agents to a single file in the directory agentJavaExportTestDir2', async () => {
        const exportDirectory = "agentJavaExportTestDir2";
        const CMD = `frodo agent java export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent java export -A": should export all java agents to separate files', async () => {
        const CMD = `frodo agent java export -A`;
        await testExport(CMD, env, type);
    });

    test('"frodo agent java export --all-separate --no-metadata --directory agentJavaExportTestDir3": should export all java agents to separate files in the directory agentJavaExportTestDir3', async () => {
        const exportDirectory = "agentJavaExportTestDir3";
        const CMD = `frodo agent java export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });
});
