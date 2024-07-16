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
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export --agent-id frodo-test-java-agent
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -i frodo-test-java-agent -f my-frodo-test-java-agent.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -Ni frodo-test-java-agent -D agentJavaExportTestDir1
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export --all
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -a --file my-allAlphaAgents.java.agent.json
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -NaD agentJavaExportTestDir2
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export -A
FRODO_MOCK=record FRODO_NO_CACHE=1 FRODO_HOST=https://openam-frodo-dev.forgeblocks.com/am frodo agent java export --all-separate --no-metadata --directory agentJavaExportTestDir3
*/
import { getEnv, testExport } from './utils/TestUtils';
import { connection as c } from './utils/TestConfig';

process.env['FRODO_MOCK'] = '1';
const env = getEnv(c);

const type = 'java.agent';

describe('frodo agent java export', () => {
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
