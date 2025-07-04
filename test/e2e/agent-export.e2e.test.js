/**
 * Follow this process to write e2e tests for the CLI project:
 *
 * 1. Test if all the necessary mocks for your tests already exist.
 *    In mock mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=1 frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    If your command completes without errors and with the expected results,
 *    all the required mocks already exist and you are good to write your
 *    test and skip to step #4.
 *
 *    If, however, your command fails and you see errors like the one below,
 *    you know you need to record the mock responses first:
 *
 *    [Polly] [adapter:node-http] Recording for the following request is not found and `recordIfMissing` is `false`.
 *
 * 2. Record mock responses for your exact command.
 *    In mock record mode, run the command you want to test with the same arguments
 *    and parameters exactly as you want to test it, for example:
 *
 *    $ FRODO_MOCK=record frodo conn save https://openam-frodo-dev.forgeblocks.com/am volker.scheuber@forgerock.com Sup3rS3cr3t!
 *
 *    Wait until you see all the Polly instances (mock recording adapters) have
 *    shutdown before you try to run step #1 again.
 *    Messages like these indicate mock recording adapters shutting down:
 *
 *    Polly instance 'conn/4' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 2s...
 *    Polly instance 'conn/save/3' stopping in 3s...
 *    Polly instance 'conn/4' stopping in 1s...
 *    Polly instance 'conn/save/3' stopping in 2s...
 *    Polly instance 'conn/4' stopped.
 *    Polly instance 'conn/save/3' stopping in 1s...
 *    Polly instance 'conn/save/3' stopped.
 *
 * 3. Validate your freshly recorded mock responses are complete and working.
 *    Re-run the exact command you want to test in mock mode (see step #1).
 *
 * 4. Write your test.
 *    Make sure to use the exact command including number of arguments and params.
 *
 * 5. Commit both your test and your new recordings to the repository.
 *    Your tests are likely going to reside outside the frodo-lib project but
 *    the recordings must be committed to the frodo-lib project.
 */

/*
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export --agent-id frodo-test-java-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export -i frodo-test-web-agent -f my-frodo-test-web-agent.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export -Ni frodo-test-web-agent -D agentExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export -a --file my-allAlphaAgents.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export -NaD agentExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export -AD agentExportTestDir4
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent export --all-separate --no-metadata --directory agentExportTestDir3
// Classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent export -i AgentService -gm classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent export -aD agentExportTestDir5 -gm classic
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=http://openam-frodo-dev.classic.com:8080/am frodo agent export -AD agentExportTestDir6 --global --type classic
*/
import { getEnv, testExport } from './utils/TestUtils';
import {classic_connection as cc, connection as c} from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
process.env['FRODO_CONNECTION_PROFILES_PATH'] =
    './test/e2e/env/Connections.json';
const env = getEnv(c);
const classicEnv = getEnv(cc);

const type = 'agent';

describe('frodo agent export', () => {
    test('"frodo agent export --agent-id frodo-test-java-agent": should export the agent with agent id "frodo-test-java-agent"', async () => {
        const exportFile = "frodo-test-java-agent.java.agent.json";
        const CMD = `frodo agent export --agent-id frodo-test-java-agent`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent export -i frodo-test-web-agent -f my-frodo-test-web-agent.agent.json": should export the agent with agent id "frodo-test-web-agent" into file named my-frodo-test-web-agent.agent.json', async () => {
        const exportFile = "my-frodo-test-web-agent.agent.json";
        const CMD = `frodo agent export -i frodo-test-web-agent -f ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent export -Ni frodo-test-web-agent -D agentExportTestDir1": should export the agent with agent id "frodo-test-web-agent" into the directory named agentExportTestDir1', async () => {
        const exportDirectory = "agentExportTestDir1";
        const CMD = `frodo agent export -Ni frodo-test-web-agent -D ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent export --all": should export all agents to a single file', async () => {
        const exportFile = "allAlphaAgents.agent.json";
        const CMD = `frodo agent export --all`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent export -a --file my-allAlphaAgents.agent.json": should export all agents to a single file named my-allAlphaAgents.agent.json', async () => {
        const exportFile = "my-allAlphaAgents.agent.json";
        const CMD = `frodo agent export -a --file ${exportFile}`;
        await testExport(CMD, env, type, exportFile);
    });

    test('"frodo agent export -NaD agentExportTestDir2": should export all agents to a single file in the directory agentExportTestDir2', async () => {
        const exportDirectory = "agentExportTestDir2";
        const CMD = `frodo agent export -NaD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent export -AD agentExportTestDir4": should export all agents to separate files in the directory agentExportTestDir4', async () => {
        const exportDirectory = "agentExportTestDir4";
        const CMD = `frodo agent export -AD ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent export --all-separate --no-metadata --directory agentExportTestDir3": should export all agents to separate files in the directory agentExportTestDir3', async () => {
        const exportDirectory = "agentExportTestDir3";
        const CMD = `frodo agent export --all-separate --no-metadata --directory ${exportDirectory}`;
        await testExport(CMD, env, type, undefined, exportDirectory, false);
    });

    test('"frodo agent export -i AgentService -gm classic": should export the global agent with agent id "AgentService"', async () => {
        const exportFile = "AgentService.agent.json";
        const CMD = `frodo agent export -i AgentService -gm classic`;
        await testExport(CMD, classicEnv, type, exportFile);
    });

    test('"frodo agent export -aD agentExportTestDir5 -gm classic": should export all global agents to a single file in the directory agentExportTestDir5', async () => {
        const exportDirectory = "agentExportTestDir5";
        const CMD = `frodo agent export -aD ${exportDirectory} -gm classic`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });

    test('"frodo agent export -AD agentExportTestDir6 --global --type classic": should export all global agents to separate files in the directory agentExportTestDir6', async () => {
        const exportDirectory = "agentExportTestDir6";
        const CMD = `frodo agent export -AD ${exportDirectory} --global --type classic`;
        await testExport(CMD, classicEnv, type, undefined, exportDirectory, false);
    });
});
